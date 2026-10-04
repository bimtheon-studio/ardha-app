// Foncier et marché en ligne de commande (F-05) : charger et lire les ventes DVF, l'ECLN, les indices
// et Sitadel ; lancer et lire l'analyse de marché d'une étude. `--inline` calcule dans la CLI.
import { Command, Option } from 'nest-commander';

import type { AnalysisStep, MarketResult, MarketSales, PriceIndicatorJson, StudyMarket } from '../contracts/index.ts';
import { departmentOf, isMarketRadius, MARKET_RADII, priceIndicators, type SaleCategory, type SaleSegment } from '../domain/index.ts';
import { MarketRepository } from '../geo/market.repository.ts';
import { SourceStatesRepository } from '../geo/source-states.repository.ts';
import { MarketAnalyses } from '../ingestion/market-analyses.ts';
import { DVF_SOURCE, MarketData } from '../ingestion/market-data.ts';
import { GeoDvf } from '../sources/dvf.ts';
import { MarketService } from '../studies/market.service.ts';
import type { Actor } from '../studies/studies.service.ts';
import { frenchDate, InlineCommand, type InlineOption, JsonCommand, type JsonOption, print } from './geo.commands.ts';
import { describeStep } from './risk.commands.ts';

const CLI: Actor = { userId: null, origin: 'cli' };
const STATUS = { none: 'jamais demandée', queued: 'en file', running: 'en cours', ready: 'prête', failed: 'en échec' } as const;
const CATEGORY: Record<SaleCategory, string> = { house: 'Maisons', apartment: 'Appartements', land: 'Terrains' };
const SEGMENT: Record<SaleSegment, string> = { existing: 'ancien', new: 'neuf (VEFA)' };

const euros = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`;
const perM2 = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €/m²`;

function radius(value: string): MarketResult['radiusM'] {
  const n = Number(value);
  if (!isMarketRadius(n)) throw new Error(`Rayon parmi ${MARKET_RADII.join(', ')} m.`);
  return n as MarketResult['radiusM'];
}

function value<T>(k: { status: 'ok'; data: T } | { status: 'unavailable'; error: string }, show: (v: T) => string): string {
  return k.status === 'ok' ? show(k.data) : `indisponible (${k.error})`;
}

export function describeIndicators(indicators: readonly PriceIndicatorJson[]): string[] {
  return indicators
    .filter((i) => i.current)
    .map((i) => {
      const c = i.current!;
      const trend = i.trendPct === null ? '' : `, ${i.trendPct > 0 ? '+' : ''}${i.trendPct.toLocaleString('fr-FR')} % sur un an`;
      return `  ${CATEGORY[i.category]}${i.category === 'land' ? '' : ` ${SEGMENT[i.segment]}`} : ${perM2(c.median)} (P25 ${perM2(c.p25)}, P75 ${perM2(c.p75)}, ${c.count} vente(s)${trend})${i.lowSample ? ' — peu de ventes' : ''}`;
    });
}

export function describeMarket(r: StudyMarket): string {
  const lines = [
    `Analyse de marché : ${STATUS[r.status]}, rayon ${r.radiusM} m${r.stale ? ', périmée (parcelles ou rayon modifiés)' : ''}${r.newerData ? ', données plus récentes disponibles' : ''}${r.computedAt ? `, calculée le ${frenchDate(r.computedAt)}` : ''}`,
  ];
  if (r.error) lines.push(`  erreur : ${r.error}`);
  if (r.progress.length > 0 && r.status !== 'ready') lines.push('  Déroulé :', ...r.progress.map(describeStep));
  const res = r.result;
  if (!res) return lines.join('\n');
  lines.push(`  Centre ${res.center.join(', ')}, rayon ${res.radiusM} m${res.covered ? '' : ' — non couvert par DVF'}`);
  lines.push(
    `  DVF : ${value(res.dvf, (d) => `${d.comparableCount} vente(s) comparable(s) sur ${d.saleCount}, du ${d.from ?? '—'} au ${d.horizon ?? '—'} ; millésimes ${d.departments.map((x) => `${x.code} ${x.years.map((y) => y.year).join(', ')}`).join(' ; ')}`)}`,
  );
  if (res.dvf.status === 'ok') lines.push(...describeIndicators(res.dvf.data.indicators));
  lines.push(
    `  Neuf (ECLN) : ${value(res.newBuild, (n) => n.quarters.filter((q) => q.housingType !== 'all' && q.pricePerM2).map((q) => `${q.quarter} ${q.housingType === 'collective' ? 'collectif' : 'individuel'} ${perM2(q.pricePerM2!)}`).join(', ') || `aucun prix publié (${n.department})`)}`,
  );
  lines.push(
    `  Sitadel : ${value(res.permits, (p) => p.rows.filter((x) => x.housingType === 'all').map((x) => `${x.year} ${x.authorizedUnits ?? 0} autorisé(s)/${x.startedUnits ?? 0} commencé(s)`).join(', ') || 'aucun')}`,
  );
  lines.push(`  Indices : ${value(res.indices, (is) => is.map((i) => `${i.label} ${i.last.value.toLocaleString('fr-FR')} (${i.last.period}${i.yearChangePct === null ? '' : `, ${i.yearChangePct > 0 ? '+' : ''}${i.yearChangePct.toLocaleString('fr-FR')} % sur un an`})`).join(' ; '))}`);
  return lines.join('\n');
}

export function describeSales(s: MarketSales, limit: number): string {
  const lines = [`${s.sales.length}${s.truncated ? '+' : ''} vente(s) dans ${s.radiusM} m de ${s.center.join(', ')}`];
  for (const x of s.sales.slice(0, limit)) {
    const area = x.builtArea ? `${x.builtArea} m²` : x.landArea ? `${x.landArea} m² de terrain` : '—';
    lines.push(
      `  ${x.date}  ${x.distanceM.toString().padStart(4)} m  ${x.propertyType.padEnd(11)} ${euros(x.price).padStart(12)}  ${area.padEnd(18)} ${x.pricePerM2 ? perM2(x.pricePerM2) : '(hors prix)'}  ${x.address ?? ''}${x.vefa ? ' [VEFA]' : ''}${x.parcels.length ? ` [${x.parcels.length} parcelle(s)]` : ''}`,
    );
  }
  if (s.sales.length > limit) lines.push(`  … ${s.sales.length - limit} autre(s) (--limit)`);
  return lines.join('\n');
}

@Command({ name: 'dvf:load', arguments: '<department>', description: 'Charge les ventes DVF d’un département (millésimes publiés par geo-DVF)' })
export class DvfLoadCommand extends JsonCommand {
  constructor(
    private readonly data: MarketData,
    private readonly geoDvf: GeoDvf,
  ) {
    super();
  }

  @Option({ flags: '--year <year>', description: 'Un seul millésime' })
  parseYear(v: string): number {
    return Number(v);
  }

  @Option({ flags: '--force', description: 'Relit l’index et recharge même les fichiers inchangés (avec --year)' })
  parseForce(): boolean {
    return true;
  }

  async run([department]: string[], options: JsonOption & { year?: number; force?: boolean }): Promise<void> {
    if (options.year) {
      const file = (await this.geoDvf.departmentFiles(options.year)).find((f) => f.department === department);
      if (!file) throw new Error(`Pas de fichier geo-DVF pour ${department} en ${options.year}.`);
      const count = await this.data.loadDvf(department!, file);
      print(options.json, { department, year: options.year, count }, () => `${department} ${options.year} : ${count} vente(s), fichier du ${file.modifiedAt.slice(0, 10)}`);
      return;
    }
    const [d] = await this.data.ensureDvf([department!], options.force);
    if (!d) throw new Error(`DVF ne couvre pas le département ${department}.`);
    print(options.json, d, () =>
      [`${d.code} : ${d.years.map((y) => `${y.year} (fichier du ${y.modifiedAt.slice(0, 10)})`).join(', ') || 'rien en base'}`, d.loaded.length ? `  chargé(s) à l’instant : ${d.loaded.join(', ')}` : '  rien à recharger', ...(d.failed ? ['  une partie n’a pas pu être chargée'] : [])].join('\n'),
    );
  }
}

@Command({ name: 'dvf:status', arguments: '[department]', description: 'État des ventes DVF en base, par département et millésime' })
export class DvfStatusCommand extends JsonCommand {
  constructor(
    private readonly states: SourceStatesRepository,
    private readonly repository: MarketRepository,
  ) {
    super();
  }

  async run([department]: string[], options: JsonOption): Promise<void> {
    const states = (await this.states.list(DVF_SOURCE)).filter((s) => !department || s.scope.startsWith(`${department}/`));
    const rows = states.map((s) => ({ scope: s.scope, status: s.status, version: s.version, mutations: s.itemCount, checkedAt: s.loadedAt?.toISOString() ?? null, error: s.error }));
    const counts = department ? await this.repository.dvfCount(department) : [];
    print(options.json, { states: rows, counts }, () =>
      rows.length === 0
        ? 'Aucune vente DVF en base.'
        : rows.map((r) => `${r.scope.padEnd(8)} ${r.status.padEnd(8)} ${String(r.mutations ?? '—').padStart(7)} vente(s), fichier du ${r.version?.slice(0, 10) ?? '—'}, vérifié le ${frenchDate(r.checkedAt)}${r.error ? ` — ${r.error}` : ''}`).join('\n'),
    );
  }
}

@Command({ name: 'dvf:sales', arguments: '<lon> <lat>', description: 'Ventes DVF en base autour d’un point, et leurs prix, sans étude' })
export class DvfSalesCommand extends JsonCommand {
  constructor(private readonly repository: MarketRepository) {
    super();
  }

  @Option({ flags: '--radius <m>', description: `Rayon (${MARKET_RADII.join(', ')} m ; 500 par défaut)` })
  parseRadius(v: string): number {
    return radius(v);
  }

  @Option({ flags: '--limit <n>', description: 'Ventes affichées (20 par défaut)' })
  parseLimit(v: string): number {
    return Number(v);
  }

  async run([lon, lat]: string[], options: JsonOption & { radius?: MarketResult['radiusM']; limit?: number }): Promise<void> {
    const center: [number, number] = [Number(lon), Number(lat)];
    const radiusM = options.radius ?? 500;
    const rows = await this.repository.salesWithin(center, radiusM, {}, 1501);
    const sales: MarketSales = { center, radiusM, sales: rows.slice(0, 1500), truncated: rows.length > 1500 };
    const horizon = await this.repository.horizon([...new Set(rows.map((r) => departmentOf(r.communeCode)))]);
    const indicators = horizon ? priceIndicators(await this.repository.comparablesWithin(center, radiusM), horizon) : [];
    print(options.json, { ...sales, horizon, indicators }, () => [describeSales(sales, options.limit ?? 20), `Prix (12 mois jusqu’au ${horizon ?? '—'}) :`, ...describeIndicators(indicators)].join('\n'));
  }
}

@Command({ name: 'market:analyze', arguments: '<study>', description: 'Demande l’analyse de marché d’une étude (par le worker ; --inline sur place)' })
export class MarketAnalyzeCommand extends InlineCommand {
  constructor(
    private readonly market: MarketService,
    private readonly runner: MarketAnalyses,
  ) {
    super();
  }

  @Option({ flags: '--radius <m>', description: `Change le rayon de l’étude (${MARKET_RADII.join(', ')} m)` })
  parseRadius(v: string): number {
    return radius(v);
  }

  @Option({ flags: '--force', description: 'Refait l’analyse même à jour' })
  parseForce(): boolean {
    return true;
  }

  async run([id]: string[], options: InlineOption & { force?: boolean; radius?: MarketResult['radiusM'] }): Promise<void> {
    // --inline : sans job pour le worker (qui calculerait en même temps).
    let r = await this.market.request(CLI, id!, { force: options.force ?? options.inline ?? false, ...(options.radius && { radiusM: options.radius }) }, { worker: !options.inline });
    if (options.inline) {
      const shown = new Set<string>();
      const live = (steps: AnalysisStep[]) => {
        for (const st of steps) {
          const mark = `${st.key}:${st.state}`;
          if (options.json || shown.has(mark) || st.state === 'pending') continue;
          shown.add(mark);
          console.log(describeStep(st));
        }
      };
      await this.runner.run({ studyId: id!, parcelsKey: await this.market.key(id!) }, true, live);
      r = await this.market.get(CLI, id!);
    }
    print(options.json, r, () => describeMarket(r));
  }
}

@Command({ name: 'market:show', arguments: '<study>', description: 'Affiche l’analyse de marché d’une étude' })
export class MarketShowCommand extends JsonCommand {
  constructor(private readonly market: MarketService) {
    super();
  }

  async run([id]: string[], options: JsonOption): Promise<void> {
    const r = await this.market.get(CLI, id!);
    print(options.json, r, () => describeMarket(r));
  }
}

@Command({ name: 'market:sales', arguments: '<study>', description: 'Ventes DVF dans le rayon d’une étude, les plus récentes d’abord' })
export class MarketSalesCommand extends JsonCommand {
  constructor(private readonly market: MarketService) {
    super();
  }

  @Option({ flags: '--type <type>', description: 'house, apartment, land, commercial, outbuilding, other' })
  parseType(v: string): string {
    return v;
  }

  @Option({ flags: '--segment <segment>', description: 'existing (ancien) ou new (VEFA)' })
  parseSegment(v: string): string {
    return v;
  }

  @Option({ flags: '--from <year>', description: 'Ventes depuis cette année' })
  parseFrom(v: string): number {
    return Number(v);
  }

  @Option({ flags: '--limit <n>', description: 'Ventes affichées (20 par défaut)' })
  parseLimit(v: string): number {
    return Number(v);
  }

  async run([id]: string[], options: JsonOption & { type?: string; segment?: 'existing' | 'new'; from?: number; limit?: number }): Promise<void> {
    const s = await this.market.sales(CLI, id!, { type: options.type ?? 'all', segment: options.segment ?? 'all', ...(options.from && { from: options.from }) });
    print(options.json, s, () => describeSales(s, options.limit ?? 20));
  }
}

@Command({ name: 'ecln:load', description: 'Charge l’ECLN (prix du neuf par département), s’il a plus de 30 jours' })
export class EclnLoadCommand extends JsonCommand {
  constructor(private readonly data: MarketData) {
    super();
  }

  @Option({ flags: '--force', description: 'Recharge même à jour' })
  parseForce(): boolean {
    return true;
  }

  async run(_: string[], options: JsonOption & { force?: boolean }): Promise<void> {
    const r = await this.data.ensureNewBuild(options.force);
    print(options.json, r, () => `ECLN : dernier trimestre ${r.version ?? '—'}, ${r.origin === 'fetched' ? 'chargé à l’instant' : `en base depuis le ${frenchDate(r.asOf.toISOString())}`}`);
  }
}

@Command({ name: 'index:load', description: 'Charge les séries INSEE du catalogue (ICC, BT01, prix de l’ancien), si elles ont plus de 30 jours' })
export class IndexLoadCommand extends JsonCommand {
  constructor(private readonly data: MarketData) {
    super();
  }

  @Option({ flags: '--force', description: 'Recharge même à jour' })
  parseForce(): boolean {
    return true;
  }

  async run(_: string[], options: JsonOption & { force?: boolean }): Promise<void> {
    const r = await this.data.ensureIndices(options.force);
    print(options.json, r, () => `Indices INSEE : ${r.origin === 'fetched' ? 'chargés à l’instant' : `en base depuis le ${frenchDate(r.asOf.toISOString())}`}`);
  }
}

@Command({ name: 'sitadel:show', arguments: '<commune>', description: 'Logements autorisés et commencés d’une commune (Sitadel), chargés s’ils ont plus de 30 jours' })
export class SitadelShowCommand extends JsonCommand {
  constructor(
    private readonly data: MarketData,
    private readonly repository: MarketRepository,
  ) {
    super();
  }

  @Option({ flags: '--force', description: 'Recharge même à jour' })
  parseForce(): boolean {
    return true;
  }

  async run([commune]: string[], options: JsonOption & { force?: boolean }): Promise<void> {
    const r = await this.data.ensurePermits(commune!, options.force);
    const rows = await this.repository.permits(commune!, 0);
    print(options.json, { ...r, rows }, () =>
      [
        `Sitadel ${commune} : ${r.origin === 'fetched' ? 'chargé à l’instant' : `en base depuis le ${frenchDate(r.asOf.toISOString())}`}`,
        ...rows.filter((x) => x.housingType === 'all').map((x) => `  ${x.year} : ${x.authorizedUnits ?? 0} logement(s) autorisé(s), ${x.startedUnits ?? 0} commencé(s)`),
      ].join('\n'),
    );
  }
}

export const MARKET_COMMANDS = [
  DvfLoadCommand,
  DvfStatusCommand,
  DvfSalesCommand,
  MarketAnalyzeCommand,
  MarketShowCommand,
  MarketSalesCommand,
  EclnLoadCommand,
  IndexLoadCommand,
  SitadelShowCommand,
];
