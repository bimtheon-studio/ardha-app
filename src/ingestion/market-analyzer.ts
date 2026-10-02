// Analyse de marché d'une étude (F-05), par le worker : départements touchés par le cercle, ventes
// DVF à jour, prix et tendances des ventes comparables, ECLN du département, Sitadel de la commune,
// indices INSEE ; puis le cadastre des communes des ventes est demandé, pour les parcelles vendues
// (Q10). Chaque source est lue à part : une source muette rend sa partie « indisponible » (DT-34).
import { Injectable, Logger } from '@nestjs/common';

import { type AnalysisStep, MARKET_VERSION, type MarketResult } from '../contracts/index.ts';
import {
  circleProbes,
  departmentOf,
  indexSeriesFor,
  indexSummary,
  isDvfCovered,
  marketCenter,
  priceHistory,
  priceIndicators,
  principalCommune,
} from '../domain/index.ts';
import { CadastreService } from '../geo/cadastre.service.ts';
import { CommunesRepository } from '../geo/communes.repository.ts';
import { MarketRepository } from '../geo/market.repository.ts';
import { Communes } from '../sources/communes.ts';
import type { StudyParcelRecord } from '../studies/studies.repository.ts';
import { AnalysisProgress } from './analysis-progress.ts';
import { type DvfDepartment, MarketData } from './market-data.ts';

type Known<T> = { status: 'ok'; data: T } | { status: 'unavailable'; error: string };
type MarketRadiusM = MarketResult['radiusM'];

/** Années de Sitadel gardées dans l'analyse. */
const PERMIT_YEARS = 8;
/** Trimestres de l'ECLN gardés. */
const NEW_BUILD_QUARTERS = 4;

const euros = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €/m²`;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const MARKET_STEPS = [
  { key: 'area', label: 'Départements du cercle' },
  { key: 'dvf', label: 'Ventes DVF (DGFiP, Etalab)' },
  { key: 'prices', label: 'Prix des ventes comparables' },
  { key: 'new-build', label: 'Prix du neuf du département (ECLN)' },
  { key: 'permits', label: 'Logements autorisés de la commune (Sitadel)' },
  { key: 'indices', label: 'Indices INSEE' },
  { key: 'parcels', label: 'Parcelles vendues' },
] as const;

@Injectable()
export class MarketAnalyzer {
  private readonly logger = new Logger('MarketAnalyzer');

  constructor(
    private readonly data: MarketData,
    private readonly repository: MarketRepository,
    private readonly communes: CommunesRepository,
    private readonly communeSource: Communes,
    private readonly cadastre: CadastreService,
  ) {}

  private async known<T>(what: string, fn: () => Promise<T>): Promise<Known<T>> {
    try {
      return { status: 'ok', data: await fn() };
    } catch (error) {
      this.logger.warn(`${what} : ${message(error)}`);
      return { status: 'unavailable', error: message(error) };
    }
  }

  /** Départements où tombent le centre et 8 points du cercle : en base si la commune y est, sinon geo.api.gouv.fr. */
  private async departments(center: [number, number], radiusM: number, parcelCommunes: readonly string[]): Promise<string[]> {
    const found = new Set(parcelCommunes.map(departmentOf));
    const codes = await Promise.all(
      (circleProbes(center, radiusM) as [number, number][]).map(
        async ([lon, lat]) => (await this.communes.locate(lon, lat))?.code ?? (await this.communeSource.locate(lon, lat).catch(() => null))?.code,
      ),
    );
    for (const code of codes) if (code) found.add(departmentOf(code));
    return [...found].sort();
  }

  /** `persist` reçoit le déroulé à chaque étape (enregistré par l'appelant, vu pendant le calcul). */
  async analyze(parcels: readonly StudyParcelRecord[], radiusM: MarketRadiusM, persist: (steps: AnalysisStep[]) => Promise<void> = async () => {}): Promise<MarketResult> {
    const center = marketCenter(parcels.map((p) => p.geometry));
    const communeCode = principalCommune(parcels)!;
    const covered = isDvfCovered(communeCode);
    const progress = new AnalysisProgress(MARKET_STEPS, persist, () => new Date());

    const departments = await progress.run(
      'area',
      () => this.departments(center, radiusM, parcels.map((p) => p.communeCode)),
      (codes) => ({ state: 'done', detail: `Département${codes.length > 1 ? 's' : ''} ${codes.join(', ')}, dans ${radiusM} m` }),
    );

    const dvf = await progress.run(
      'dvf',
      () => this.known('DVF', () => this.data.ensureDvf(departments)),
      (r) => {
        if (!covered) return { state: 'done', detail: 'Alsace-Moselle et Mayotte : DVF ne couvre pas ces ventes' };
        if (r.status !== 'ok') return { state: 'unavailable', detail: 'geo-DVF n’a pas répondu' };
        const years = r.data.flatMap((d) => d.years.map((y) => y.year));
        const loaded = r.data.flatMap((d) => d.loaded);
        const failed = r.data.some((d) => d.failed);
        const range = years.length > 0 ? `${Math.min(...years)} à ${Math.max(...years)}` : 'aucun millésime';
        const detail = `${range}${loaded.length > 0 ? `, ${loaded.length} millésime(s) chargé(s) à l’instant` : ', déjà en base'}${failed ? ' ; une partie n’a pas pu être mise à jour' : ''}`;
        return { state: years.length === 0 ? 'unavailable' : failed ? 'partial' : 'done', detail };
      },
    );

    const dvfData = await progress.run(
      'prices',
      () =>
        this.known('Prix', async () => {
          if (dvf.status !== 'ok' || dvf.data.every((d) => d.years.length === 0)) throw new Error('Aucune vente DVF en base pour ces départements.');
          return this.prices(center, radiusM, dvf.data);
        }),
      (r) => {
        if (r.status !== 'ok') return { state: 'unavailable', detail: covered ? 'Sans ventes DVF, pas de prix' : 'Non couvert par DVF' };
        const apartment = r.data.indicators.find((i) => i.category === 'apartment' && i.segment === 'existing')?.current;
        const house = r.data.indicators.find((i) => i.category === 'house' && i.segment === 'existing')?.current;
        const best = [apartment && `appartements anciens ${euros(apartment.median)}`, house && `maisons anciennes ${euros(house.median)}`].filter(Boolean).join(', ');
        return { state: 'done', detail: `${r.data.comparableCount} vente(s) comparable(s) sur ${r.data.saleCount} dans ${radiusM} m${best ? ` ; ${best}` : ''}` };
      },
    );

    const department = departmentOf(communeCode);
    const newBuild = await progress.run(
      'new-build',
      () =>
        this.known('ECLN', async () => {
          await this.data.ensureNewBuild();
          const rows = await this.repository.newBuild(department, NEW_BUILD_QUARTERS);
          return {
            department,
            quarters: rows.map((r) => ({
              quarter: r.quarter,
              housingType: r.housingType as 'collective' | 'individual' | 'all',
              pricePerM2: r.pricePerSqm,
              averagePrice: r.averagePrice,
              reservations: r.reservations,
              listed: r.listed,
              stock: r.stock,
              monthsToSell: r.monthsToSell,
            })),
          };
        }),
      (r) => {
        if (r.status !== 'ok') return { state: 'unavailable', detail: 'DiDo n’a pas répondu' };
        const latest = r.data.quarters.find((q) => q.housingType === 'collective' && q.pricePerM2);
        if (!latest) return { state: 'done', detail: `Pas de prix publié pour le département ${department}` };
        return { state: 'done', detail: `${latest.quarter} : collectif ${euros(latest.pricePerM2!)}, ${latest.reservations ?? 0} réservation(s)` };
      },
    );

    const commune = await this.communes.byCode(communeCode);
    const permits = await progress.run(
      'permits',
      () =>
        this.known('Sitadel', async () => {
          const refreshed = await this.data.ensurePermits(communeCode);
          const rows = await this.repository.permits(communeCode, 0);
          const lastYear = rows.reduce((y, r) => Math.max(y, r.year), 0);
          return {
            communeCode,
            communeName: commune?.name ?? null,
            asOf: refreshed.asOf.toISOString(),
            rows: rows
              .filter((r) => r.year > lastYear - PERMIT_YEARS)
              .map(({ year, housingType, authorizedUnits, startedUnits, authorizedArea, startedArea }) => ({ year, housingType, authorizedUnits, startedUnits, authorizedArea, startedArea })),
          };
        }),
      (r) => {
        if (r.status !== 'ok') return { state: 'unavailable', detail: 'DiDo n’a pas répondu' };
        const all = r.data.rows.filter((x) => x.housingType === 'all');
        const last = all[0];
        return { state: 'done', detail: last ? `${last.year} : ${last.authorizedUnits ?? 0} logement(s) autorisé(s), ${last.startedUnits ?? 0} commencé(s)` : 'Aucun logement autorisé publié' };
      },
    );

    const indices = await progress.run(
      'indices',
      () =>
        this.known('INSEE', async () => {
          await this.data.ensureIndices();
          const series = indexSeriesFor(department);
          const values = await this.repository.indexValues(series.map((s) => s.id));
          return series.flatMap((s) => {
            const summary = indexSummary(values.get(s.id)!);
            return summary ? [{ id: s.id, label: s.label, kind: s.kind, propertyType: s.propertyType ?? null, ...summary }] : [];
          });
        }),
      (r) => {
        if (r.status !== 'ok') return { state: 'unavailable', detail: 'L’INSEE n’a pas répondu' };
        const icc = r.data.find((i) => i.id === '000008630');
        return { state: 'done', detail: `${r.data.length} série(s)${icc ? ` ; ICC ${icc.last.value} (${icc.last.period})` : ''}` };
      },
    );

    await progress.run(
      'parcels',
      async () => {
        const codes = await this.repository.communesWithin(center, radiusM);
        const requested: string[] = [];
        for (const code of codes) if ((await this.cadastre.requestLoad(code)).cadastre.status !== 'ready') requested.push(code);
        return { codes, requested };
      },
      (r) => ({
        state: 'done',
        detail: r.codes.length === 0 ? 'Aucune vente dans le cercle' : r.requested.length === 0 ? `Cadastre en base pour ${r.codes.length} commune(s)` : `Cadastre demandé pour ${r.requested.length} commune(s) sur ${r.codes.length}`,
      }),
    );

    return {
      version: MARKET_VERSION,
      center,
      radiusM,
      covered,
      dvf: covered ? dvfData : { status: 'unavailable', error: 'DVF ne couvre pas l’Alsace-Moselle ni Mayotte.' },
      newBuild,
      permits,
      indices,
    };
  }

  private async prices(center: [number, number], radiusM: number, departments: DvfDepartment[]) {
    const [sales, summary, horizon] = await Promise.all([
      this.repository.comparablesWithin(center, radiusM),
      this.repository.circleSummary(center, radiusM),
      this.repository.horizon(departments.map((d) => d.code)),
    ]);
    const names = new Map(await Promise.all(summary.communes.map(async (c) => [c.code, (await this.communes.byCode(c.code))?.name ?? null] as const)));
    return {
      departments: departments.map((d) => ({ code: d.code, years: d.years })),
      from: summary.from,
      horizon,
      saleCount: summary.communes.reduce((n, c) => n + c.sales, 0),
      comparableCount: sales.length,
      indicators: horizon ? priceIndicators(sales, horizon) : [],
      history: { year: priceHistory(sales, 'year'), quarter: priceHistory(sales, 'quarter') },
      communes: summary.communes.map((c) => ({ ...c, name: names.get(c.code) ?? null })),
    };
  }
}
