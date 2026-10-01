// Études et leurs parcelles (données client, F-02). Les modifications de parcelles se font sous
// verrou de l'étude (`FOR UPDATE`) : deux onglets qui ajoutent chacun une parcelle ne s'écrasent pas.
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';

import type { Address } from '../contracts/index.ts';
import { DB, type Db } from '../db/db.ts';
import { study, studyParcel, type StudyRow } from '../db/schema.ts';
import type { Surface } from '../domain/index.ts';

/** Une transaction ou la base : les deux exécutent les mêmes requêtes. */
export type Executor = Pick<Db, 'execute' | 'select' | 'insert' | 'update' | 'delete'>;

export type StudyParcelRecord = {
  id: string;
  position: number;
  communeCode: string;
  prefix: string;
  section: string;
  number: string;
  contenance: number | null;
  area: number;
  geometry: Surface;
  version: string;
};

export type NewStudyParcel = Omit<StudyParcelRecord, 'position'>;

export type StudySummaryRecord = StudyRow & { parcelCount: number; contenance: number; area: number };

export interface NewStudy {
  ownerId: string;
  name: string;
  nameIsProvisional: boolean;
  communeCode: string;
  communeName: string | null;
  parcelsKey: string;
  address?: Address | null;
  addresses?: Address[];
  chosenAddressId?: string | null;
  addressKey?: string | null;
  thumbnailKey?: string | null;
}

const parcelColumns = sql`parcel_id AS id, position, commune_code AS "communeCode", prefix, section, number, contenance, area,
  version, ST_AsGeoJSON(geometry, 7)::json AS geometry`;

const totals = {
  parcelCount: sql<number>`(SELECT count(*)::int FROM study_parcels p WHERE p.study_id = ${study.id})`,
  contenance: sql<number>`(SELECT coalesce(sum(p.contenance), 0)::int FROM study_parcels p WHERE p.study_id = ${study.id})`,
  area: sql<number>`(SELECT coalesce(sum(p.area), 0)::float8 FROM study_parcels p WHERE p.study_id = ${study.id})`,
};

@Injectable()
export class StudiesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /** Études d'un auteur (ou toutes, sans auteur), dans la corbeille ou non, les plus récentes d'abord. */
  async list(filter: { ownerId?: string; trash: boolean }): Promise<StudySummaryRecord[]> {
    return this.db
      .select({ ...getTableColumns(study), ...totals })
      .from(study)
      .where(and(filter.ownerId ? eq(study.ownerId, filter.ownerId) : undefined, filter.trash ? isNotNull(study.deletedAt) : isNull(study.deletedAt)))
      .orderBy(desc(filter.trash ? study.deletedAt : study.updatedAt), desc(study.id));
  }

  async summary(id: string, ex: Executor = this.db): Promise<StudySummaryRecord | undefined> {
    const [r] = await ex.select({ ...getTableColumns(study), ...totals }).from(study).where(eq(study.id, id));
    return r;
  }

  async get(id: string, ex: Executor = this.db): Promise<StudyRow | undefined> {
    const [r] = await ex.select().from(study).where(eq(study.id, id));
    return r;
  }

  /** Verrouille l'étude jusqu'à la fin de la transaction. */
  async lock(tx: Executor, id: string): Promise<StudyRow | undefined> {
    const [r] = await tx.select().from(study).where(eq(study.id, id)).for('update');
    return r;
  }

  async parcels(studyId: string, ex: Executor = this.db): Promise<StudyParcelRecord[]> {
    const r = await ex.execute<StudyParcelRecord>(sql`SELECT ${parcelColumns} FROM study_parcels WHERE study_id = ${studyId} ORDER BY position`);
    return r.rows;
  }

  async create(input: NewStudy, parcels: readonly NewStudyParcel[]): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(study).values(input).returning({ id: study.id });
      await this.insertParcels(tx, row!.id, parcels, 0);
      return row!.id;
    });
  }

  async insertParcels(tx: Executor, studyId: string, parcels: readonly NewStudyParcel[], firstPosition: number): Promise<void> {
    const rows = JSON.stringify(parcels.map((p, i) => ({ ...p, position: firstPosition + i })));
    await tx.execute(sql`
      INSERT INTO study_parcels (study_id, parcel_id, position, commune_code, prefix, section, number, contenance, area, geometry, version)
      SELECT ${studyId}, r.id, r.position, r."communeCode", r.prefix, r.section, r.number, r.contenance, r.area,
             ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(r.geometry), 4326)), r.version
      FROM jsonb_to_recordset(${rows}::jsonb)
        AS r(id text, position integer, "communeCode" text, prefix text, section text, number text, contenance integer,
             area float8, geometry jsonb, version text)
      ON CONFLICT DO NOTHING`);
  }

  async removeParcel(tx: Executor, studyId: string, parcelId: string): Promise<void> {
    await tx.delete(studyParcel).where(and(eq(studyParcel.studyId, studyId), eq(studyParcel.parcelId, parcelId)));
  }

  async update(id: string, patch: Partial<Omit<StudyRow, 'id' | 'ownerId' | 'createdAt'>>, ex: Executor = this.db): Promise<void> {
    await ex
      .update(study)
      .set({ ...patch, updatedAt: patch.updatedAt ?? sql`now()` })
      .where(eq(study.id, id));
  }

  /**
   * Enregistre ce que le worker a calculé pour une empreinte de parcelles, seulement si les parcelles
   * n'ont pas changé entre-temps ; rend faux sinon. La date de modification ne bouge pas.
   */
  async saveDerived(id: string, parcelsKey: string, patch: Partial<StudyRow>): Promise<boolean> {
    const r = await this.db
      .update(study)
      .set(patch)
      .where(and(eq(study.id, id), eq(study.parcelsKey, parcelsKey)))
      .returning({ id: study.id });
    return r.length > 0;
  }

  /** Études hors corbeille dont l'adresse ou la vignette est en retard, modifiées avant `before`. */
  async lagging(before: Date): Promise<Pick<StudyRow, 'id' | 'parcelsKey' | 'addressKey' | 'thumbnailKey'>[]> {
    return this.db
      .select({ id: study.id, parcelsKey: study.parcelsKey, addressKey: study.addressKey, thumbnailKey: study.thumbnailKey })
      .from(study)
      .where(and(isNull(study.deletedAt), lt(study.updatedAt, before), or(isNull(study.addressKey), ne(study.addressKey, study.parcelsKey), isNull(study.thumbnailKey), ne(study.thumbnailKey, study.parcelsKey))))
      .orderBy(asc(study.updatedAt))
      .limit(100);
  }

  /** Études dans la corbeille depuis avant `before`. */
  async purgeable(before: Date): Promise<Pick<StudyRow, 'id' | 'ownerId' | 'name'>[]> {
    return this.db
      .select({ id: study.id, ownerId: study.ownerId, name: study.name })
      .from(study)
      .where(and(isNotNull(study.deletedAt), lt(study.deletedAt, before)));
  }

  async delete(ids: readonly string[]): Promise<void> {
    if (ids.length > 0) await this.db.delete(study).where(inArray(study.id, [...ids]));
  }
}
