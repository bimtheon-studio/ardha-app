// Études en ligne de commande (F-02) : tout ce que fait l'écran, pour piloter et déboguer sans le
// front. La CLI agit sans restriction d'auteur ; `--user` filtre ou désigne l'auteur. Adresse et
// vignette passent par le worker, comme pour l'API ; `--inline` les calcule sur place.
import { writeFile } from 'node:fs/promises';

import { Command, Option } from 'nest-commander';

import { UsersRepository } from '../accounts/users.repository.ts';
import type { Study, StudySummary } from '../contracts/index.ts';
import { formatArea, normalizeEmail } from '../domain/index.ts';
import { StudyDerivations } from '../ingestion/study-derivations.ts';
import { type Actor, StudiesService } from '../studies/studies.service.ts';
import { frenchDate, InlineCommand, type InlineOption, JsonCommand, type JsonOption, print } from './geo.commands.ts';

const CLI: Actor = { userId: null, origin: 'cli' };

const STEP_STATE = { done: 'faite', todo: 'à faire', upcoming: 'à venir' } as const;

function describeSummary(s: StudySummary): string {
  const where = [s.communeName ?? s.communeCode, `${s.parcelCount} parcelle${s.parcelCount > 1 ? 's' : ''}`, formatArea(s.contenance || s.area)];
  const trash = s.deletedAt ? `\tcorbeille, purge le ${frenchDate(s.purgeAt)}` : '';
  return `${s.id}\t${s.name}\t${where.join(' · ')}\tmodifiée le ${frenchDate(s.updatedAt)}${trash}`;
}

function describeStudy(s: Study): string {
  return [
    `${s.name}${s.nameIsProvisional ? ' (nom provisoire)' : ''} — ${s.id}`,
    `  commune : ${s.communeName ?? '?'} (${s.communeCode})`,
    `  adresse : ${s.addressPending ? 'en calcul' : (s.address?.label ?? 'aucune trouvée')}`,
    ...s.addresses.slice(1).map((a) => `            ou ${a.label} [${a.id}]`),
    `  parcelles : ${s.parcels.map((p) => `${p.label} (${p.id}, ${p.version})`).join(', ')}`,
    `  contenance : ${formatArea(s.contenance)} ; surface calculée : ${formatArea(s.area)}`,
    `  vignette : ${s.thumbnailPending ? 'en calcul' : (s.thumbnailUrl ?? 'aucune')}`,
    `  étapes : ${s.steps.map((st) => `${st.label} ${STEP_STATE[st.state]}${st.lot ? ` (${st.lot})` : ''}`).join(', ')}`,
    `  créée le ${frenchDate(s.createdAt)}, modifiée le ${frenchDate(s.updatedAt)}`,
    ...(s.deletedAt ? [`  dans la corbeille depuis le ${frenchDate(s.deletedAt)}, purge le ${frenchDate(s.purgeAt)}`] : []),
  ].join('\n');
}

abstract class UserCommand extends JsonCommand {
  constructor(protected readonly users: UsersRepository) {
    super();
  }

  @Option({ flags: '-u, --user <email>', description: 'Auteur des études' })
  parseUser(value: string): string {
    return value;
  }

  protected async userId(email: string | undefined): Promise<string | undefined> {
    if (email === undefined) return undefined;
    const user = await this.users.byEmail(normalizeEmail(email));
    if (!user) throw new Error(`Aucun compte avec l’adresse ${email}`);
    return user.id;
  }
}

@Command({ name: 'study:list', description: 'Liste les études (toutes, ou d’un auteur), ou la corbeille' })
export class StudyListCommand extends UserCommand {
  constructor(
    users: UsersRepository,
    private readonly studies: StudiesService,
  ) {
    super(users);
  }

  @Option({ flags: '--trash', description: 'La corbeille' })
  parseTrash(): boolean {
    return true;
  }

  @Option({ flags: '-q, --search <texte>', description: 'Recherche dans le nom, la commune et l’adresse' })
  parseSearch(value: string): string {
    return value;
  }

  async run(_: string[], options: JsonOption & { user?: string; trash?: boolean; search?: string }): Promise<void> {
    const userId = (await this.userId(options.user)) ?? null;
    const list = await this.studies.list({ ...CLI, userId }, { q: options.search, trash: options.trash ?? false });
    print(options.json, list, () => (list.length === 0 ? 'Aucune étude.' : list.map(describeSummary).join('\n')));
  }
}

@Command({ name: 'study:show', arguments: '<id>', description: 'Affiche une étude : parcelles, adresses, étapes' })
export class StudyShowCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  async run([id]: string[], options: JsonOption): Promise<void> {
    const s = await this.studies.get(CLI, id!);
    print(options.json, s, () => describeStudy(s));
  }
}

@Command({ name: 'study:create', arguments: '<parcels...>', description: 'Crée une étude à partir de parcelles (IDU) ; --user obligatoire' })
export class StudyCreateCommand extends UserCommand {
  constructor(
    users: UsersRepository,
    private readonly studies: StudiesService,
    private readonly derivations: StudyDerivations,
  ) {
    super(users);
  }

  @Option({ flags: '--inline', description: 'Calcule l’adresse et la vignette dans la CLI, sans le worker' })
  parseInline(): boolean {
    return true;
  }

  async run(parcelIds: string[], options: InlineOption & { user?: string }): Promise<void> {
    const userId = await this.userId(options.user);
    if (!userId) throw new Error('Indiquez l’auteur : --user <email>');
    let s = await this.studies.create({ userId, origin: 'cli' }, parcelIds);
    if (options.inline) {
      await this.derivations.deriveNow(s.id);
      s = await this.studies.get(CLI, s.id);
    }
    print(options.json, s, () => describeStudy(s));
  }
}

@Command({ name: 'study:rename', arguments: '<id> <name...>', description: 'Renomme une étude (le nom ne bouge plus ensuite)' })
export class StudyRenameCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  async run([id, ...name]: string[], options: JsonOption): Promise<void> {
    const s = await this.studies.update(CLI, id!, { name: name.join(' ') });
    print(options.json, s, () => describeStudy(s));
  }
}

@Command({ name: 'study:address', arguments: '<id> <addressId>', description: 'Choisit l’adresse de l’étude parmi celles trouvées (identifiant BAN)' })
export class StudyAddressCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  async run([id, addressId]: string[], options: JsonOption): Promise<void> {
    const s = await this.studies.update(CLI, id!, { addressId: addressId! });
    print(options.json, s, () => describeStudy(s));
  }
}

@Command({ name: 'study:add-parcel', arguments: '<id> <parcel>', description: 'Ajoute une parcelle (IDU) à une étude' })
export class StudyAddParcelCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  async run([id, parcelId]: string[], options: JsonOption): Promise<void> {
    const s = await this.studies.addParcel(CLI, id!, parcelId!);
    print(options.json, s, () => describeStudy(s));
  }
}

@Command({ name: 'study:remove-parcel', arguments: '<id> <parcel>', description: 'Retire une parcelle (IDU) d’une étude' })
export class StudyRemoveParcelCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  async run([id, parcelId]: string[], options: JsonOption): Promise<void> {
    const s = await this.studies.removeParcel(CLI, id!, parcelId!);
    print(options.json, s, () => describeStudy(s));
  }
}

@Command({ name: 'study:duplicate', arguments: '<id>', description: 'Copie une étude (nom, adresse, parcelles, vignette)' })
export class StudyDuplicateCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  async run([id]: string[], options: JsonOption): Promise<void> {
    const s = await this.studies.duplicate(CLI, id!);
    print(options.json, s, () => describeStudy(s));
  }
}

@Command({ name: 'study:delete', arguments: '<id>', description: 'Met une étude à la corbeille (purgée au bout de 30 jours)' })
export class StudyDeleteCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  async run([id]: string[], options: JsonOption): Promise<void> {
    await this.studies.trash(CLI, id!);
    const s = await this.studies.get(CLI, id!);
    print(options.json, s, () => `Étude « ${s.name} » mise à la corbeille ; purge le ${frenchDate(s.purgeAt)}.`);
  }
}

@Command({ name: 'study:restore', arguments: '<id>', description: 'Sort une étude de la corbeille' })
export class StudyRestoreCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  async run([id]: string[], options: JsonOption): Promise<void> {
    const s = await this.studies.restore(CLI, id!);
    print(options.json, s, () => `Étude « ${s.name} » restaurée.`);
  }
}

@Command({ name: 'study:refresh', arguments: '<id>', description: 'Recalcule l’adresse et la vignette (par le worker ; --inline sur place)' })
export class StudyRefreshCommand extends InlineCommand {
  constructor(
    private readonly studies: StudiesService,
    private readonly derivations: StudyDerivations,
  ) {
    super();
  }

  async run([id]: string[], options: InlineOption): Promise<void> {
    let s = await this.studies.get(CLI, id!);
    if (options.inline) {
      await this.derivations.deriveNow(s.id);
      s = await this.studies.get(CLI, id!);
      print(options.json, s, () => describeStudy(s));
      return;
    }
    await this.studies.refresh(CLI, id!);
    print(options.json, { queued: true, id }, () => `Adresse et vignette de « ${s.name} » confiées au worker.`);
  }
}

@Command({ name: 'study:thumbnail', arguments: '<id>', description: 'Écrit la vignette d’une étude dans un fichier PNG' })
export class StudyThumbnailCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  @Option({ flags: '-o, --out <file>', description: 'Fichier de sortie', required: true })
  parseOut(value: string): string {
    return value;
  }

  async run([id]: string[], options: JsonOption & { out: string }): Promise<void> {
    const file = await this.studies.thumbnail(CLI, id!);
    await writeFile(options.out, file.body);
    print(options.json, { out: options.out, bytes: file.body.length }, () => `${options.out} : ${file.body.length} octets`);
  }
}

@Command({ name: 'study:purge', description: 'Efface les études restées 30 jours dans la corbeille (le worker le fait chaque nuit)' })
export class StudyPurgeCommand extends JsonCommand {
  constructor(private readonly studies: StudiesService) {
    super();
  }

  @Option({ flags: '--days <n>', description: 'Durée de séjour dans la corbeille, en jours (30 par défaut)' })
  parseDays(value: string): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) throw new Error(`Nombre de jours invalide : ${value}`);
    return n;
  }

  async run(_: string[], options: JsonOption & { days?: number }): Promise<void> {
    const ids = await this.studies.purge('cli', options.days);
    print(options.json, { purged: ids }, () => `${ids.length} étude(s) effacée(s).`);
  }
}

export const STUDY_COMMANDS = [
  StudyListCommand,
  StudyShowCommand,
  StudyCreateCommand,
  StudyRenameCommand,
  StudyAddressCommand,
  StudyAddParcelCommand,
  StudyRemoveParcelCommand,
  StudyDuplicateCommand,
  StudyDeleteCommand,
  StudyRestoreCommand,
  StudyRefreshCommand,
  StudyThumbnailCommand,
  StudyPurgeCommand,
];
