// Études (F-02) : créer depuis une sélection, lister, rouvrir, renommer, choisir l'adresse, modifier
// les parcelles, dupliquer, corbeille. Partagé par l'API et la CLI ; l'adresse et la vignette sont
// confiées au worker (`StudyJobs`). Une étude n'est visible que de son auteur : celle d'un autre
// répond « introuvable », comme une étude qui n'existe pas.
import { Inject, Injectable } from '@nestjs/common';

import { AuditLog, type AuditOrigin } from '../audit/audit-log.ts';
import type { Study, StudyParcel, StudySummary } from '../contracts/index.ts';
import type { StudyRow } from '../db/schema.ts';
import {
  areaM2,
  copyName,
  parcelLabel,
  parcelsKey,
  principalCommune,
  proposeStudyName,
  SELECTION_MAX,
  studySteps,
  TRASH_RETENTION_DAYS,
} from '../domain/index.ts';
import { CommunesRepository } from '../geo/communes.repository.ts';
import { type ParcelRecord, ParcelsRepository } from '../geo/parcels.repository.ts';
import { Clock } from '../shared/clock.ts';
import { DomainError } from '../shared/errors.ts';
import { FileStore, type StoredFile } from '../shared/files.ts';
import { StudyJobs } from './studies.jobs.ts';
import { type Executor, type NewStudyParcel, StudiesRepository, type StudyParcelRecord, type StudySummaryRecord } from './studies.repository.ts';

const DAY_MS = 24 * 3600 * 1000;

/** Qui agit : un utilisateur (API, ou CLI avec `--user`), ou la CLI sans restriction (`userId` nul). */
export interface Actor {
  userId: string | null;
  origin: AuditOrigin;
  ip?: string | null;
}

export const thumbnailFile = (studyId: string) => `studies/${studyId}/thumbnail.png`;

function toNewParcel(p: ParcelRecord): NewStudyParcel {
  return {
    id: p.id,
    communeCode: p.communeCode,
    prefix: p.prefix,
    section: p.section,
    number: p.number,
    contenance: p.contenance,
    area: areaM2(p.geometry),
    geometry: p.geometry,
    version: p.version,
  };
}

/** Pour la recherche : minuscules, sans accents. */
function fold(text: string | null | undefined): string {
  return (text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

@Injectable()
export class StudiesService {
  constructor(
    private readonly studies: StudiesRepository,
    private readonly parcels: ParcelsRepository,
    private readonly communes: CommunesRepository,
    private readonly jobs: StudyJobs,
    private readonly auditLog: AuditLog,
    private readonly clock: Clock,
    @Inject(FileStore) private readonly files: FileStore,
  ) {}

  private summary(r: StudyRow & { parcelCount: number; contenance: number; area: number }): StudySummary {
    return {
      id: r.id,
      name: r.name,
      communeCode: r.communeCode,
      communeName: r.communeName,
      addressLabel: r.address?.label ?? null,
      parcelCount: r.parcelCount,
      contenance: r.contenance,
      area: r.area,
      thumbnailUrl: r.thumbnailKey ? `/api/studies/${r.id}/thumbnail?v=${r.thumbnailKey}` : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt?.toISOString() ?? null,
      purgeAt: r.deletedAt ? new Date(r.deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS).toISOString() : null,
    };
  }

  private toStudy(r: StudySummaryRecord, parcels: readonly StudyParcelRecord[]): Study {
    return {
      ...this.summary(r),
      parcels: parcels.map((p) => ({
        id: p.id,
        communeCode: p.communeCode,
        prefix: p.prefix,
        section: p.section,
        number: p.number,
        label: parcelLabel(p),
        contenance: p.contenance,
        area: p.area,
        version: p.version,
        geometry: p.geometry as StudyParcel['geometry'],
      })),
      address: r.address,
      addresses: r.addresses,
      chosenAddressId: r.chosenAddressId,
      nameIsProvisional: r.nameIsProvisional,
      addressPending: r.addressKey !== r.parcelsKey,
      thumbnailPending: r.thumbnailKey !== r.parcelsKey,
      steps: studySteps({ parcelCount: parcels.length }),
    };
  }

  /** L'étude, si l'acteur y a droit ; sinon « introuvable ». */
  private visible<R extends StudyRow>(actor: Actor, row: R | undefined): R {
    if (!row || (actor.userId !== null && row.ownerId !== actor.userId)) throw new DomainError('unknown-study');
    return row;
  }

  private editable<R extends StudyRow>(actor: Actor, row: R | undefined): R {
    const r = this.visible(actor, row);
    if (r.deletedAt) throw new DomainError('study-in-trash');
    return r;
  }

  private async communeName(code: string): Promise<string | null> {
    return (await this.communes.byCode(code))?.name ?? null;
  }

  private async lag(row: Pick<StudyRow, 'id' | 'parcelsKey' | 'addressKey' | 'thumbnailKey'>): Promise<void> {
    if (row.addressKey !== row.parcelsKey || row.thumbnailKey !== row.parcelsKey) {
      await this.jobs.enqueue({ studyId: row.id, parcelsKey: row.parcelsKey });
    }
  }

  async list(actor: Actor, query: { q?: string; trash: boolean }): Promise<StudySummary[]> {
    const rows = await this.studies.list({ ownerId: actor.userId ?? undefined, trash: query.trash });
    const words = fold(query.q).split(/\s+/).filter(Boolean);
    return rows
      .filter((r) => {
        const text = fold(`${r.name} ${r.communeName} ${r.address?.label}`);
        return words.every((w) => text.includes(w));
      })
      .map((r) => this.summary(r));
  }

  async get(actor: Actor, id: string): Promise<Study> {
    const row = this.visible(actor, await this.studies.summary(id));
    return this.toStudy(row, await this.studies.parcels(id));
  }

  /** Crée l'étude à partir de parcelles chargées ; le nom est provisoire jusqu'à l'adresse (Q2). */
  async create(actor: Actor & { userId: string }, parcelIds: readonly string[]): Promise<Study> {
    const ids = [...new Set(parcelIds)];
    if (ids.length === 0) throw new DomainError('study-needs-parcel');
    if (ids.length > SELECTION_MAX) throw new DomainError('study-limit-reached');
    const records = await this.parcels.byIds(ids);
    const missing = ids.filter((id) => !records.some((p) => p.id === id));
    if (missing.length > 0) throw new DomainError('unknown-parcel', `Parcelle inconnue : ${missing.join(', ')}.`);
    const parcels = records.map(toNewParcel);
    const communeCode = principalCommune(parcels)!;
    const communeName = await this.communeName(communeCode);
    const key = parcelsKey(ids);
    const id = await this.studies.create(
      {
        ownerId: actor.userId,
        name: proposeStudyName({ address: null, parcels, communeName, today: this.clock.now() }),
        nameIsProvisional: true,
        communeCode,
        communeName,
        parcelsKey: key,
      },
      parcels,
    );
    // L'étude telle que créée, lue avant de confier adresse et vignette au worker : la réponse ne
    // dépend pas de la vitesse du worker.
    const created = await this.get(actor, id);
    await this.jobs.enqueue({ studyId: id, parcelsKey: key });
    await this.auditLog.record({ origin: actor.origin, action: 'study.created', actorId: actor.userId, targetId: id, ip: actor.ip, details: { parcels: ids.length } });
    return created;
  }

  /** Renommer fige le nom (Q2) ; l'adresse se choisit parmi celles trouvées (Q3). */
  async update(actor: Actor, id: string, patch: { name?: string; addressId?: string }): Promise<Study> {
    const row = this.editable(actor, await this.studies.get(id));
    const changes: Partial<StudyRow> = {};
    if (patch.name !== undefined) Object.assign(changes, { name: patch.name.trim(), nameIsProvisional: false });
    if (patch.addressId !== undefined) {
      const address = row.addresses.find((a) => a.id === patch.addressId);
      if (!address) throw new DomainError('unknown-address');
      Object.assign(changes, { address, chosenAddressId: address.id });
    }
    await this.studies.update(id, changes);
    return this.get(actor, id);
  }

  /**
   * Modifie les parcelles sous verrou, puis recalcule l'empreinte et la commune ; adresse et vignette
   * repartent au worker. `change` rend faux quand il n'y a rien à faire.
   */
  private async changeParcels(actor: Actor, id: string, change: (tx: Executor, current: StudyParcelRecord[]) => Promise<boolean>): Promise<Study> {
    const changed = await this.studies.transaction(async (tx) => {
      this.editable(actor, await this.studies.lock(tx, id));
      if (!(await change(tx, await this.studies.parcels(id, tx)))) return null;
      const parcels = await this.studies.parcels(id, tx);
      const communeCode = principalCommune(parcels)!;
      const key = parcelsKey(parcels.map((p) => p.id));
      await this.studies.update(id, { parcelsKey: key, communeCode, communeName: await this.communeName(communeCode) }, tx);
      return key;
    });
    if (changed) await this.jobs.enqueue({ studyId: id, parcelsKey: changed });
    return this.get(actor, id);
  }

  addParcel(actor: Actor, id: string, parcelId: string): Promise<Study> {
    return this.changeParcels(actor, id, async (tx, current) => {
      if (current.some((p) => p.id === parcelId)) return false;
      if (current.length >= SELECTION_MAX) throw new DomainError('study-limit-reached');
      const [record] = await this.parcels.byIds([parcelId]);
      if (!record) throw new DomainError('unknown-parcel');
      await this.studies.insertParcels(tx, id, [toNewParcel(record)], Math.max(-1, ...current.map((p) => p.position)) + 1);
      return true;
    });
  }

  removeParcel(actor: Actor, id: string, parcelId: string): Promise<Study> {
    return this.changeParcels(actor, id, async (tx, current) => {
      if (!current.some((p) => p.id === parcelId)) return false;
      if (current.length === 1) throw new DomainError('study-needs-parcel');
      await this.studies.removeParcel(tx, id, parcelId);
      return true;
    });
  }

  /** Copie : nom « (copie) », adresse, parcelles, vignette (Q10). */
  async duplicate(actor: Actor, id: string): Promise<Study> {
    const source = this.editable(actor, await this.studies.get(id));
    const parcels = await this.studies.parcels(id);
    const thumbnail = source.thumbnailKey ? await this.files.get(thumbnailFile(id)) : null;
    const copyId = await this.studies.create(
      {
        ownerId: source.ownerId,
        name: copyName(source.name),
        nameIsProvisional: source.nameIsProvisional,
        communeCode: source.communeCode,
        communeName: source.communeName,
        parcelsKey: source.parcelsKey,
        address: source.address,
        addresses: source.addresses,
        chosenAddressId: source.chosenAddressId,
        addressKey: source.addressKey,
        thumbnailKey: thumbnail ? source.thumbnailKey : null,
      },
      parcels,
    );
    if (thumbnail) await this.files.put(thumbnailFile(copyId), thumbnail.body, thumbnail.contentType);
    await this.lag((await this.studies.get(copyId))!);
    await this.auditLog.record({ origin: actor.origin, action: 'study.duplicated', actorId: actor.userId, targetId: copyId, ip: actor.ip, details: { from: id } });
    return this.get(actor, copyId);
  }

  /** Corbeille (Q9) : sans effet sur une étude qui y est déjà. */
  async trash(actor: Actor, id: string): Promise<void> {
    const row = this.visible(actor, await this.studies.get(id));
    if (row.deletedAt) return;
    await this.studies.update(id, { deletedAt: this.clock.now(), updatedAt: row.updatedAt });
    await this.auditLog.record({ origin: actor.origin, action: 'study.trashed', actorId: actor.userId, targetId: id, ip: actor.ip });
  }

  async restore(actor: Actor, id: string): Promise<Study> {
    const row = this.visible(actor, await this.studies.get(id));
    if (row.deletedAt) {
      await this.studies.update(id, { deletedAt: null });
      await this.auditLog.record({ origin: actor.origin, action: 'study.restored', actorId: actor.userId, targetId: id, ip: actor.ip });
      await this.lag(row);
    }
    return this.get(actor, id);
  }

  /** Efface pour de bon les études restées 30 jours dans la corbeille, et leur vignette. */
  async purge(origin: AuditOrigin, retentionDays = TRASH_RETENTION_DAYS): Promise<string[]> {
    const before = new Date(this.clock.now().getTime() - retentionDays * DAY_MS);
    const rows = await this.studies.purgeable(before);
    for (const r of rows) await this.files.delete(thumbnailFile(r.id));
    await this.studies.delete(rows.map((r) => r.id));
    for (const r of rows) await this.auditLog.record({ origin, action: 'study.purged', targetId: r.id, details: { name: r.name } });
    return rows.map((r) => r.id);
  }

  /** Remet l'adresse et la vignette au worker, même à jour (CLI). */
  async refresh(actor: Actor, id: string): Promise<void> {
    const row = this.visible(actor, await this.studies.get(id));
    await this.jobs.enqueue({ studyId: id, parcelsKey: row.parcelsKey, force: true });
  }

  async thumbnail(actor: Actor, id: string): Promise<StoredFile> {
    const row = this.visible(actor, await this.studies.get(id));
    const file = row.thumbnailKey ? await this.files.get(thumbnailFile(id)) : null;
    if (!file) throw new DomainError('unknown-study', 'Vignette pas encore prête.');
    return file;
  }
}
