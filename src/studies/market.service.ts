// Analyse de marché d'une étude (F-05), côté API et CLI : lire l'analyse (périmée si les parcelles ou
// le rayon ont changé ; « données plus récentes » si un millésime DVF a été chargé depuis), changer le
// rayon et la demander au worker, lister les ventes du cercle depuis la base.
import { Injectable } from '@nestjs/common';

import { MARKET_SALES_LIMIT, MARKET_VERSION, MarketResult, type MarketSales, type StudyMarket } from '../contracts/index.ts';
import { marketCenter, marketKey } from '../domain/index.ts';
import { MarketRepository } from '../geo/market.repository.ts';
import { SourceStatesRepository } from '../geo/source-states.repository.ts';
import { Clock } from '../shared/clock.ts';
import { AnalysesRepository } from './analyses.repository.ts';
import { ANALYZE_MARKET_JOB, StudyJobs } from './studies.jobs.ts';
import { StudiesRepository } from './studies.repository.ts';
import { type Actor, StudiesService } from './studies.service.ts';

export const MARKET_SOURCES: StudyMarket['sources'] = [
  { key: 'dvf', label: 'Demandes de valeurs foncières (DGFiP), géolocalisées par Etalab', url: 'https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/', licence: 'Licence ouverte 2.0' },
  { key: 'ecln', label: 'Commercialisation des logements neufs (ECLN), SDES', url: 'https://www.statistiques.developpement-durable.gouv.fr/', licence: 'Licence ouverte 2.0' },
  { key: 'sitadel', label: 'Logements autorisés et commencés (Sitadel), SDES', url: 'https://www.statistiques.developpement-durable.gouv.fr/', licence: 'Licence ouverte 2.0' },
  { key: 'insee', label: 'INSEE : ICC, BT01, indices des prix des logements anciens (INSEE-Notaires)', url: 'https://www.insee.fr/fr/statistiques/series', licence: 'Licence ouverte 2.0' },
];

type Radius = MarketResult['radiusM'];

@Injectable()
export class MarketService {
  constructor(
    private readonly studies: StudiesService,
    private readonly repository: StudiesRepository,
    private readonly analyses: AnalysesRepository,
    private readonly market: MarketRepository,
    private readonly states: SourceStatesRepository,
    private readonly jobs: StudyJobs,
    private readonly clock: Clock,
  ) {}

  /** Un millésime en base que l'analyse n'a pas lu (nouveau, ou fichier plus récent). */
  private async newerData(result: MarketResult): Promise<boolean> {
    if (result.dvf.status !== 'ok') return false;
    const read = new Set(result.dvf.data.departments.flatMap((d) => d.years.map((y) => `${d.code}/${y.year}@${y.modifiedAt}`)));
    const codes = result.dvf.data.departments.map((d) => d.code);
    const states = (await this.states.list('dvf')).filter((s) => s.version && codes.some((c) => s.scope.startsWith(`${c}/`)));
    return states.some((s) => !read.has(`${s.scope}@${s.version}`));
  }

  async get(actor: Actor, id: string): Promise<StudyMarket> {
    const study = await this.studies.require(actor, id);
    const radiusM = study.marketRadiusM as Radius;
    const row = await this.analyses.get(id, 'market');
    const empty = { radiusM, stale: false, newerData: false, requestedAt: null, computedAt: null, error: null, result: null, sources: MARKET_SOURCES, progress: [] };
    if (!row) return { status: 'none', ...empty };
    // Un résultat d'une ancienne version du schéma ne se lit plus : il est à refaire.
    const parsed = MarketResult.safeParse(row.result);
    const result = parsed.success ? parsed.data : null;
    return {
      status: row.status,
      radiusM,
      stale: row.parcelsKey !== marketKey(study.parcelsKey, study.marketRadiusM) || (row.result !== null && (row.result as { version?: number }).version !== MARKET_VERSION),
      newerData: result ? await this.newerData(result) : false,
      requestedAt: row.requestedAt.toISOString(),
      computedAt: row.computedAt?.toISOString() ?? null,
      error: row.error,
      result,
      sources: MARKET_SOURCES,
      progress: row.progress,
    };
  }

  /**
   * Change le rayon s'il est fourni, puis demande l'analyse ; sans effet si elle est à jour ou en
   * cours, sauf `force`. `worker: false` (CLI `--inline`) : la demande est notée, l'appelant calcule.
   */
  async request(actor: Actor, id: string, input: { force?: boolean; radiusM?: Radius } = {}, options: { worker?: boolean } = {}): Promise<StudyMarket> {
    const study = await this.studies.require(actor, id, { editable: true });
    const radiusM = input.radiusM ?? study.marketRadiusM;
    if (radiusM !== study.marketRadiusM) await this.repository.update(id, { marketRadiusM: radiusM });
    const key = marketKey(study.parcelsKey, radiusM);
    const force = input.force ?? false;
    const { queued } = await this.analyses.request(id, 'market', key, this.clock.now(), force);
    if (queued && options.worker !== false) await this.jobs.enqueue({ studyId: id, parcelsKey: key, ...(force && { force }) }, [ANALYZE_MARKET_JOB]);
    return this.get(actor, id);
  }

  /** Empreinte actuelle du marché de l'étude (parcelles et rayon). */
  async key(id: string): Promise<string> {
    const study = await this.studies.require({ userId: null, origin: 'cli' }, id);
    return marketKey(study.parcelsKey, study.marketRadiusM);
  }

  /** Ventes du cercle de l'étude, les plus récentes d'abord ; lues en base, jamais à la source. */
  async sales(actor: Actor, id: string, query: { type: string; segment: 'all' | 'existing' | 'new'; from?: number }): Promise<MarketSales> {
    const study = await this.studies.require(actor, id);
    const parcels = await this.repository.parcels(id);
    const center = marketCenter(parcels.map((p) => p.geometry));
    const radiusM = study.marketRadiusM as Radius;
    const rows = await this.market.salesWithin(
      center,
      radiusM,
      { type: query.type, ...(query.segment !== 'all' && { segment: query.segment }), ...(query.from && { fromYear: query.from }) },
      MARKET_SALES_LIMIT + 1,
    );
    return { center, radiusM, sales: rows.slice(0, MARKET_SALES_LIMIT), truncated: rows.length > MARKET_SALES_LIMIT };
  }
}
