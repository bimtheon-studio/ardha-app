// Carte et parcellaire en ligne de commande (F-01) : piloter et déboguer la chaîne sans le front.
// Par défaut, les commandes passent par le worker comme l'API (`commune:load` dépose un job,
// `address:search` attend sa réponse) ; `--inline` appelle la source depuis la CLI, sans worker.
// `--json` rend une sortie lisible par une machine (Claude, MCP).
import { Inject } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { CONFIG, type Config } from '../config/config.ts';
import type { Address, Commune, ParcelFeature } from '../contracts/index.ts';
import {
  areaM2,
  bboxOf,
  formatArea,
  isCommuneCode,
  parcelLabel,
  parseParcelId,
  pieces,
  REFUSAL_MESSAGES,
  type SelectableParcel,
  summarize,
  toggle,
} from '../domain/index.ts';
import { CADASTRE_SOURCE, CadastreService } from '../geo/cadastre.service.ts';
import { CommunesRepository } from '../geo/communes.repository.ts';
import { Lookups } from '../geo/lookups.ts';
import { SourceStatesRepository } from '../geo/source-states.repository.ts';
import { CadastreLoader } from '../ingestion/cadastre-loader.ts';
import { LookupHandlers } from '../ingestion/lookup-handlers.ts';
import { LiveHttp, RecordingHttp } from '../sources/http.ts';

interface JsonOption {
  json?: boolean;
}
interface InlineOption extends JsonOption {
  inline?: boolean;
}

function print(json: boolean | undefined, value: unknown, text: () => string): void {
  console.log(json ? JSON.stringify(value, null, 2) : text());
}

function frenchDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—';
}

const STATUS: Record<Commune['cadastre']['status'], string> = {
  missing: 'jamais demandé',
  queued: 'en file',
  loading: 'en cours',
  ready: 'prêt',
  failed: 'en échec',
};

function describeCommune(c: Commune): string {
  const k = c.cadastre;
  return [
    `${c.name ?? '(nom inconnu)'} (${c.code})`,
    `  cadastre : ${STATUS[k.status]}${k.version ? `, millésime ${k.version}` : ''}${k.parcelCount !== null ? `, ${k.parcelCount} parcelles` : ''}`,
    `  chargé le : ${frenchDate(k.loadedAt)}`,
    ...(k.error ? [`  erreur : ${k.error}`] : []),
  ].join('\n');
}

function describeParcel(p: ParcelFeature): string {
  const [w, s, e, n] = bboxOf(p.geometry);
  return [
    `${p.properties.label} — ${p.id}`,
    `  commune : ${p.properties.communeCode}`,
    `  contenance : ${p.properties.contenance === null ? '—' : formatArea(p.properties.contenance)}`,
    `  surface calculée : ${formatArea(areaM2(p.geometry))}`,
    `  emprise : ${[w, s, e, n].map((v) => v.toFixed(6)).join(',')}`,
  ].join('\n');
}

function describeAddress(a: Address): string {
  return `${a.label}\t${a.communeCode}\t${a.lon.toFixed(6)},${a.lat.toFixed(6)}\t${a.kind}\t${a.score.toFixed(2)}`;
}

function numberArg(value: string | undefined, name: string): number {
  const n = Number(value);
  if (value === undefined || !Number.isFinite(n)) throw new Error(`${name} invalide : ${value ?? '(absente)'}`);
  return n;
}

abstract class JsonCommand extends CommandRunner {
  @Option({ flags: '--json', description: 'Sortie JSON' })
  parseJson(): boolean {
    return true;
  }
}

abstract class InlineCommand extends JsonCommand {
  @Option({ flags: '--inline', description: 'Appelle la source depuis la CLI, sans passer par le worker' })
  parseInline(): boolean {
    return true;
  }
}

@Command({
  name: 'commune:load',
  arguments: '<codes...>',
  description: 'Demande le chargement du cadastre de communes (codes INSEE) ; --inline le fait sur place',
})
export class CommuneLoadCommand extends InlineCommand {
  constructor(
    private readonly cadastre: CadastreService,
    private readonly loader: CadastreLoader,
  ) {
    super();
  }

  @Option({ flags: '--force', description: 'Recharge même un cadastre prêt' })
  parseForce(): boolean {
    return true;
  }

  async run(codes: string[], options: InlineOption & { force?: boolean }): Promise<void> {
    const invalid = codes.filter((c) => !isCommuneCode(c));
    if (invalid.length > 0) throw new Error(`Code commune invalide : ${invalid.join(', ')}`);
    for (const code of codes) {
      if (options.inline) {
        const r = await this.loader.load(code);
        print(options.json, r, () => `${r.name} (${code}) : ${r.parcels} parcelles, millésime ${r.version}${r.skipped ? `, ${r.skipped} écartée(s)` : ''}.`);
      } else {
        const c = await this.cadastre.requestLoad(code, options.force);
        print(options.json, c, () => describeCommune(c));
      }
    }
  }
}

@Command({ name: 'commune:show', arguments: '<code>', description: 'Une commune et l’état de son cadastre' })
export class CommuneShowCommand extends JsonCommand {
  constructor(private readonly cadastre: CadastreService) {
    super();
  }

  async run([code]: string[], options: JsonOption): Promise<void> {
    const c = await this.cadastre.commune(code!);
    print(options.json, c, () => describeCommune(c));
  }
}

@Command({ name: 'commune:list', description: 'Communes connues et état de leur cadastre' })
export class CommuneListCommand extends JsonCommand {
  constructor(
    private readonly states: SourceStatesRepository,
    private readonly communes: CommunesRepository,
  ) {
    super();
  }

  async run(_: string[], options: JsonOption): Promise<void> {
    const [states, communes] = await Promise.all([this.states.list(CADASTRE_SOURCE), this.communes.list()]);
    const names = new Map(communes.map((c) => [c.code, c.name]));
    const rows = states.map((s) => ({ code: s.scope, name: names.get(s.scope) ?? null, status: s.status, version: s.version, parcels: s.itemCount, error: s.error }));
    print(options.json, rows, () =>
      rows.length === 0
        ? 'Aucune commune.'
        : rows.map((r) => `${r.code}\t${STATUS[r.status]}\t${r.version ?? '—'}\t${r.parcels ?? '—'}\t${r.name ?? ''}${r.error ? `\t${r.error}` : ''}`).join('\n'),
    );
  }
}

@Command({ name: 'parcel:show', arguments: '<ids...>', description: 'Parcelles par identifiant (IDU, 14 caractères)' })
export class ParcelShowCommand extends JsonCommand {
  constructor(private readonly cadastre: CadastreService) {
    super();
  }

  async run(ids: string[], options: JsonOption): Promise<void> {
    const invalid = ids.filter((id) => !parseParcelId(id));
    if (invalid.length > 0) throw new Error(`Identifiant de parcelle invalide : ${invalid.join(', ')} (attendu : 14 caractères, ex. 940460000A0018)`);
    const { features } = await this.cadastre.parcelsByIds(ids);
    const missing = ids.filter((id) => !features.some((f) => f.id === id));
    print(options.json, features, () => [...features.map(describeParcel), ...missing.map((id) => `${id} : inconnue (commune chargée ?)`)].join('\n'));
    if (missing.length > 0) process.exitCode = 1;
  }
}

@Command({ name: 'parcel:at', arguments: '<lon> <lat>', description: 'La parcelle qui contient un point (degrés WGS84)' })
export class ParcelAtCommand extends JsonCommand {
  constructor(private readonly cadastre: CadastreService) {
    super();
  }

  async run([lon, lat]: string[], options: JsonOption): Promise<void> {
    const p = await this.cadastre.parcelAt(numberArg(lon, 'Longitude'), numberArg(lat, 'Latitude'));
    print(options.json, p, () => (p ? describeParcel(p) : 'Aucune parcelle chargée à ce point.'));
    if (!p) process.exitCode = 1;
  }
}

@Command({
  name: 'parcel:selection',
  arguments: '<ids...>',
  description: 'Rejoue une sélection clic par clic (contiguïté, plafond) et en donne le résumé',
})
export class ParcelSelectionCommand extends JsonCommand {
  constructor(private readonly cadastre: CadastreService) {
    super();
  }

  async run(ids: string[], options: JsonOption): Promise<void> {
    const { features } = await this.cadastre.parcelsByIds(ids);
    const byId = new Map(features.map((f) => [f.id, f]));
    let selection: (SelectableParcel & { label: string })[] = [];
    const steps: { id: string; action: string; reason?: string }[] = [];
    for (const id of ids) {
      const f = byId.get(id);
      if (!f) {
        steps.push({ id, action: 'unknown' });
        continue;
      }
      const t = toggle(selection, { id, geometry: f.geometry, contenance: f.properties.contenance, label: parcelLabel(f.properties) });
      selection = t.selection;
      steps.push({ id, action: t.action, ...(t.action === 'refused' && { reason: REFUSAL_MESSAGES[t.refusal] }) });
    }
    const summary = summarize(selection);
    const verbs: Record<string, string> = { added: 'ajoutée', removed: 'retirée', refused: 'refusée', unknown: 'inconnue' };
    print(options.json, { steps, summary, selection: selection.map((p) => p.id) }, () =>
      [
        ...steps.map((s) => `${s.id}\t${verbs[s.action]}${s.reason ? ` : ${s.reason}` : ''}`),
        '',
        `${summary.count} parcelle(s), ${pieces(selection)} morceau(x)`,
        `contenance : ${formatArea(summary.contenance)}${summary.withoutContenance ? ` (${summary.withoutContenance} sans contenance)` : ''}`,
        `surface calculée : ${formatArea(summary.area)}`,
      ].join('\n'),
    );
  }
}

@Command({ name: 'address:search', arguments: '<query...>', description: 'Suggestions d’adresses (BAN), par le worker ou --inline' })
export class AddressSearchCommand extends InlineCommand {
  constructor(
    private readonly lookups: Lookups,
    private readonly handlers: LookupHandlers,
  ) {
    super();
  }

  @Option({ flags: '-l, --limit <n>', description: 'Nombre de suggestions (1 à 10, 5 par défaut)' })
  parseLimit(value: string): number {
    return Math.min(10, Math.max(1, Number(value) || 5));
  }

  async run(words: string[], options: InlineOption & { limit?: number }): Promise<void> {
    const input = { q: words.join(' '), limit: options.limit ?? 5 };
    const found = options.inline ? await this.handlers.handle('address:search', input) : await this.lookups.run('address:search', input);
    print(options.json, found, () => (found.length === 0 ? 'Aucune adresse.' : found.map(describeAddress).join('\n')));
  }
}

@Command({ name: 'address:reverse', arguments: '<lon> <lat>', description: 'Adresse la plus proche d’un point, par le worker ou --inline' })
export class AddressReverseCommand extends InlineCommand {
  constructor(
    private readonly lookups: Lookups,
    private readonly handlers: LookupHandlers,
  ) {
    super();
  }

  async run([lon, lat]: string[], options: InlineOption): Promise<void> {
    const input = { lon: numberArg(lon, 'Longitude'), lat: numberArg(lat, 'Latitude') };
    const a = options.inline ? await this.handlers.handle('address:reverse', input) : await this.lookups.run('address:reverse', input);
    print(options.json, a, () => (a ? describeAddress(a) : 'Aucune adresse.'));
  }
}

@Command({
  name: 'source:record',
  arguments: '<urls...>',
  description: 'Enregistre la réponse réelle d’URL de sources dans fixtures/http (tests, seed et e2e sans Internet)',
})
export class SourceRecordCommand extends CommandRunner {
  constructor(@Inject(CONFIG) private readonly config: Config) {
    super();
  }

  async run(urls: string[]): Promise<void> {
    const http = new RecordingHttp(new LiveHttp(), this.config.FIXTURES_DIR);
    for (const url of urls) {
      const r = await http.get({ url });
      console.log(`${r.status}\t${r.body.length} octets\t${url}`);
    }
  }
}

export const GEO_COMMANDS = [
  CommuneLoadCommand,
  CommuneShowCommand,
  CommuneListCommand,
  ParcelShowCommand,
  ParcelAtCommand,
  ParcelSelectionCommand,
  AddressSearchCommand,
  AddressReverseCommand,
  SourceRecordCommand,
];
