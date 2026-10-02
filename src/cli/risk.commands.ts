// Risques en ligne de commande (F-04) : lancer et lire l'analyse d'une étude, et interroger les
// sources directement (une commune, un point) pour déboguer. `--inline` calcule dans la CLI.
import { Command, Option } from 'nest-commander';

import type { AnalysisStep, StudyRisks } from '../contracts/index.ts';
import { clayLevel, floodClassLabel, FLOOD_SCENARIO_LABELS, FLOOD_TYPE_LABELS, floodHazard, floodScenarios } from '../domain/index.ts';
import { RiskAnalyses } from '../ingestion/risk-analyses.ts';
import { ElevationService } from '../geo/elevation.service.ts';
import { ParcelsRepository } from '../geo/parcels.repository.ts';
import { LookupHandlers } from '../ingestion/lookup-handlers.ts';
import { FloodHeights } from '../sources/flood-heights.ts';
import { Georisques } from '../sources/georisques.ts';
import { RisksService } from '../studies/risks.service.ts';
import { StudiesRepository } from '../studies/studies.repository.ts';
import type { Actor } from '../studies/studies.service.ts';
import { frenchDate, InlineCommand, type InlineOption, JsonCommand, type JsonOption, print } from './geo.commands.ts';

const CLI: Actor = { userId: null, origin: 'cli' };
const SEVERITY = { high: '!!!', medium: '!! ', low: '!  ', none: '   ', unknown: '?  ' } as const;
const STATUS = { none: 'jamais demandée', queued: 'en file', running: 'en cours', ready: 'prête', failed: 'en échec' } as const;

function value<T>(k: { status: 'ok'; data: T } | { status: 'unavailable'; error: string }, show: (v: T) => string): string {
  return k.status === 'ok' ? show(k.data) : `indisponible (${k.error})`;
}

const STEP_MARK = { pending: '·', running: '…', done: '✓', partial: '≈', unavailable: '✗' } as const;

/** « ✓ Altitudes de 23 points (IGN) : 23 altitudes reçues (0,4 s) ». */
export function describeStep(st: AnalysisStep): string {
  const seconds = st.startedAt && st.finishedAt ? ` (${((Date.parse(st.finishedAt) - Date.parse(st.startedAt)) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s)` : '';
  return `  ${STEP_MARK[st.state]} ${st.label}${st.detail ? ` : ${st.detail}` : ''}${seconds}`;
}

export function describeRisks(r: StudyRisks): string {
  const lines = [`Analyse : ${STATUS[r.status]}${r.stale ? ', périmée (parcelles modifiées)' : ''}${r.computedAt ? `, calculée le ${frenchDate(r.computedAt)}` : ''}`];
  if (r.error) lines.push(`  erreur : ${r.error}`);
  for (const a of r.axes ?? []) lines.push(`  ${SEVERITY[a.severity]} ${a.label} : ${a.state}${a.detail ? ` — ${a.detail}` : ''}`);
  for (const c of r.surcharges ?? []) lines.push(`  surcoût : ${c.label} +${c.perM2} €/m² (${c.basis})${c.sourced ? '' : ' — non sourcé'}`);
  if (r.progress.length > 0 && r.status !== 'ready') lines.push('  Déroulé :', ...r.progress.map(describeStep));
  const res = r.result;
  if (!res) return lines.join('\n');
  for (const c of res.communes) {
    lines.push(`  Commune ${c.name ?? '?'} (${c.code})`);
    lines.push(`    risques GASPAR : ${value(c.hazards, (h) => h.map((x) => x.label).join(', ') || 'aucun')}`);
    const state = (p: { state: string | null; approvedAt: string | null; prescribedAt: string | null }) =>
      p.state === 'approved' ? `, approuvé le ${p.approvedAt}` : p.state === 'prescribed' ? `, prescrit le ${p.prescribedAt}` : p.state === 'repealed' ? ', abrogé' : '';
    lines.push(`    PPR : ${value(c.plans, (ps) => ps.map((p) => `${p.label} [${p.model ?? p.kind}${p.zones.length ? `, ${p.zones.length} zone(s)` : ''}${state(p)}]`).join(' ; ') || 'aucun')}`);
    lines.push(`    CatNat : ${value(c.catnat, (n) => `${n.count} arrêté(s)`)}`);
  }
  for (const p of res.parcels) {
    lines.push(`  Parcelle ${p.label} (${p.id})`);
    lines.push(`    argiles : ${value(p.clay, (v) => v ?? 'hors zone')}`);
    lines.push(
      `    TRI : ${value(p.flood, (f) => (f.scenarios.length === 0 ? 'hors zone' : `aléa ${f.hazard} ; ${f.scenarios.map((s) => `${FLOOD_SCENARIO_LABELS[s.scenario]} ${floodClassLabel(s)}`).join(', ')}`))}`,
    );
    lines.push(`    altitudes : ${value(p.elevation, (e) => (e ? `${e.min}–${e.max} m NGF, moyenne ${e.mean} (${e.points} pts)` : 'aucune'))}${p.floodLevel ? ` ; cote indicative ${p.floodLevel.atLeast ? 'au moins ' : ''}${p.floodLevel.level} m NGF` : ''}`);
  }
  const near = `${res.radii.nearbyM} m`;
  lines.push(`  cavités à ${near} : ${value(res.cavities, (c) => String(c.items.length))}`);
  lines.push(`  installations classées à ${near} : ${value(res.installations, (i) => `${i.items.length} (sur ${i.count} dans la commune)`)}`);
  lines.push(`  sols pollués à ${near} : ${value(res.pollutedSites, (s) => `${s.items.length} (sur ${s.count})`)}`);
  lines.push(`  bornes incendie à ${res.radii.hydrantsM} m : ${value(res.hydrants, (h) => (h.items.length ? `${h.items.length}, la plus proche à ${h.items[0]!.distanceM} m` : 'aucune'))}`);
  return lines.join('\n');
}

@Command({ name: 'risk:analyze', arguments: '<study>', description: 'Demande l’analyse des risques d’une étude (par le worker ; --inline sur place)' })
export class RiskAnalyzeCommand extends InlineCommand {
  constructor(
    private readonly risks: RisksService,
    private readonly runner: RiskAnalyses,
    private readonly studies: StudiesRepository,
  ) {
    super();
  }

  @Option({ flags: '--force', description: 'Refait l’analyse même à jour' })
  parseForce(): boolean {
    return true;
  }

  async run([id]: string[], options: InlineOption & { force?: boolean }): Promise<void> {
    // --inline : sans job pour le worker (qui calculerait en même temps, sur d'autres sources).
    let r = await this.risks.request(CLI, id!, options.force ?? options.inline ?? false, { worker: !options.inline });
    if (options.inline) {
      // Le déroulé s'affiche au fil du calcul (sauf en JSON).
      const shown = new Set<string>();
      const live = (steps: AnalysisStep[]) => {
        for (const st of steps) {
          const mark = `${st.key}:${st.state}`;
          if (options.json || shown.has(mark) || st.state === 'pending') continue;
          shown.add(mark);
          console.log(describeStep(st));
        }
      };
      await this.runner.run({ studyId: id!, parcelsKey: (await this.studies.get(id!))!.parcelsKey }, true, live);
      r = await this.risks.get(CLI, id!);
    }
    print(options.json, r, () => describeRisks(r));
  }
}

@Command({ name: 'risk:show', arguments: '<study>', description: 'Affiche l’analyse des risques d’une étude' })
export class RiskShowCommand extends JsonCommand {
  constructor(private readonly risks: RisksService) {
    super();
  }

  async run([id]: string[], options: JsonOption): Promise<void> {
    const r = await this.risks.get(CLI, id!);
    print(options.json, r, () => describeRisks(r));
  }
}

@Command({ name: 'risk:commune', arguments: '<code>', description: 'Interroge Géorisques sur une commune (radon, sismicité, GASPAR, PPR), sans étude' })
export class RiskCommuneCommand extends JsonCommand {
  constructor(private readonly georisques: Georisques) {
    super();
  }

  async run([code]: string[], options: JsonOption): Promise<void> {
    const g = this.georisques;
    const [radon, seismic, hazards, plans] = await Promise.all([g.radon(code!), g.seismic(code!), g.hazards(code!), g.plans(code!)]);
    const out = { code, radon, seismic, hazards, plans };
    print(options.json, out, () =>
      [`radon : classe ${radon ?? '?'} ; sismicité : zone ${seismic ?? '?'}`, `GASPAR : ${hazards.map((h) => h.label).join(', ') || 'aucun'}`, ...plans.map((p) => `${p.kind} ${p.label} (${p.model ?? '—'}, ${p.modifiedAt ?? '—'}) : ${p.zones.length} zone(s)`)].join('\n'),
    );
  }
}

@Command({ name: 'risk:point', arguments: '<lon> <lat>', description: 'Argiles et hauteurs d’eau TRI en un point, sans étude' })
export class RiskPointCommand extends JsonCommand {
  constructor(
    private readonly georisques: Georisques,
    private readonly flood: FloodHeights,
  ) {
    super();
  }

  async run([lon, lat]: string[], options: JsonOption): Promise<void> {
    const [x, y] = [Number(lon), Number(lat)];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Point invalide : ${lon} ${lat}`);
    const [clay, hits] = await Promise.all([this.georisques.clay(x, y), this.flood.at(x, y)]);
    const scenarios = floodScenarios(hits);
    const out = { clay: clayLevel(clay), flood: { hazard: floodHazard(hits), scenarios } };
    print(options.json, out, () =>
      [
        `argiles : ${out.clay ?? 'hors zone'}`,
        `TRI : ${out.flood.hazard ? `aléa ${out.flood.hazard}` : 'hors zone'}`,
        ...scenarios.map((s) => `  ${FLOOD_TYPE_LABELS[s.type]}, scénario ${FLOOD_SCENARIO_LABELS[s.scenario]} : ${floodClassLabel(s)}`),
      ].join('\n'),
    );
  }
}

@Command({ name: 'parcel:elevation', arguments: '<parcels...>', description: 'Altitudes de parcelles (IGN) : par le worker, ou sur place avec --inline' })
export class ParcelElevationCommand extends InlineCommand {
  constructor(
    private readonly elevation: ElevationService,
    private readonly parcels: ParcelsRepository,
    private readonly handlers: LookupHandlers,
  ) {
    super();
  }

  async run(ids: string[], options: InlineOption): Promise<void> {
    // --inline : la recherche du worker est faite dans la CLI.
    const service = options.inline
      ? new ElevationService(this.parcels, { run: (name: 'elevation:points', input: { points: [number, number][] }) => this.handlers.handle(name, input) } as never)
      : this.elevation;
    const r = await service.ofParcels(ids);
    const line = (s: { min: number; max: number; mean: number; range: number; points: number } | null) =>
      s ? `${s.min} à ${s.max} m NGF, moyenne ${s.mean}, dénivelé ${s.range} m (${s.points} points)` : 'aucune altitude';
    print(options.json, r, () => [`Sélection : ${line(r.overall)}`, ...r.parcels.map((p) => `  ${p.id} : ${line(p.stats)}`), `Source : ${r.source}`].join('\n'));
  }
}

export const RISK_COMMANDS = [RiskAnalyzeCommand, RiskShowCommand, RiskCommuneCommand, RiskPointCommand, ParcelElevationCommand];
