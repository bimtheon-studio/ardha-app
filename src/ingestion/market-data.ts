// Données de référence du marché (F-05), tenues à jour par le worker à la demande d'une analyse :
//  - DVF par département (Q1) : les millésimes publiés par geo-DVF, rechargés quand la date d'un
//    fichier change ; l'index n'est relu qu'après une publication (1ᵉʳ avril, 1ᵉʳ octobre) ;
//  - ECLN (Q6) et indices INSEE (Q8) : tout d'un coup, relus au bout de 30 jours ;
//  - Sitadel (Q7) : par commune, relu au bout de 30 jours.
// Une donnée déjà chargée sert quand sa source se tait ; l'état de chaque chargement vit dans
// `source_states`.
import { Inject, Injectable, Logger } from '@nestjs/common';

import { CONFIG, type Config } from '../config/config.ts';
import { comparableOf, DVF_EXCLUDED_DEPARTMENTS, dedupMutations, dvfCheckDue, INDEX_SERIES } from '../domain/index.ts';
import { MarketRepository, type StoredMutation } from '../geo/market.repository.ts';
import { SourceStatesRepository } from '../geo/source-states.repository.ts';
import type { SourceStateRow } from '../db/schema.ts';
import { Clock } from '../shared/clock.ts';
import { Dido } from '../sources/dido.ts';
import { type DvfFile, GeoDvf } from '../sources/dvf.ts';
import { Insee } from '../sources/insee.ts';

export const DVF_SOURCE = 'dvf';
export const ECLN_SOURCE = 'ecln';
export const INDEX_SOURCE = 'insee-bdm';
export const SITADEL_SOURCE = 'sitadel';
/** Durée de vie de l'ECLN, des indices et de Sitadel, en jours. */
export const MARKET_FRESHNESS_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

export interface DvfDepartment {
  code: string;
  /** Millésimes en base, avec la date de leur fichier. */
  years: { year: number; modifiedAt: string }[];
  /** Millésimes chargés par cet appel. */
  loaded: number[];
  /** Le dernier chargement a échoué : les données en base (s'il y en a) sont plus anciennes. */
  failed: boolean;
}

export interface Refreshed {
  /** Date du dernier chargement réussi. */
  asOf: Date;
  /** `fetched` : chargé à l'instant ; `fresh` : déjà en base ; `stale` : en base, la source s'est tue. */
  origin: 'fetched' | 'fresh' | 'stale';
  version: string | null;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

@Injectable()
export class MarketData {
  private readonly logger = new Logger('MarketData');

  constructor(
    private readonly geoDvf: GeoDvf,
    private readonly dido: Dido,
    private readonly insee: Insee,
    private readonly repository: MarketRepository,
    private readonly states: SourceStatesRepository,
    private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Les millésimes à tenir : les `DVF_YEARS` plus récents publiés, et leurs fichiers. */
  private async dvfIndex(): Promise<Map<number, DvfFile[]>> {
    const years = (await this.geoDvf.years()).slice(-(this.config.DVF_YEARS ?? 100));
    const index = new Map<number, DvfFile[]>();
    for (const year of years) index.set(year, await this.geoDvf.departmentFiles(year));
    return index;
  }

  private async dvfStates(code: string): Promise<SourceStateRow[]> {
    return (await this.states.list(DVF_SOURCE)).filter((s) => s.scope.startsWith(`${code}/`));
  }

  /** Charge un millésime d'un département. */
  async loadDvf(code: string, file: DvfFile): Promise<number> {
    const scope = `${code}/${file.year}`;
    await this.states.markLoading(DVF_SOURCE, scope, this.clock.now());
    try {
      const rows = await this.geoDvf.departmentRows(file.year, code);
      const mutations: StoredMutation[] = dedupMutations(rows ?? []).map((m) => {
        const c = comparableOf(m);
        return { ...m, year: file.year, departmentCode: code, category: c?.category ?? null, pricePerM2: c?.pricePerM2 ?? null };
      });
      const count = await this.repository.replaceDvf(code, file.year, mutations);
      await this.states.markReady(DVF_SOURCE, scope, file.modifiedAt, count, this.clock.now());
      this.logger.log(`DVF ${scope} : ${count} vente(s), fichier du ${file.modifiedAt.slice(0, 10)}`);
      return count;
    } catch (error) {
      await this.states.markFailed(DVF_SOURCE, scope, message(error), this.clock.now(), false);
      throw error;
    }
  }

  /**
   * Ventes DVF des départements, à jour : l'index de geo-DVF est relu si un département n'a rien en
   * base ou si une publication est passée depuis sa dernière vérification (`force` : toujours).
   * Un millésime dont la date n'a pas changé n'est pas rechargé.
   */
  async ensureDvf(codes: readonly string[], force = false): Promise<DvfDepartment[]> {
    const covered = [...new Set(codes)].filter((c) => !DVF_EXCLUDED_DEPARTMENTS.includes(c)).sort();
    const now = this.clock.now();
    const before = new Map(await Promise.all(covered.map(async (c) => [c, await this.dvfStates(c)] as const)));
    const due = (states: SourceStateRow[]) =>
      force || !states.some((s) => s.status === 'ready') || states.some((s) => s.loadedAt && dvfCheckDue(s.loadedAt, now));
    const failed = new Set<string>();
    const loaded = new Map<string, number[]>(covered.map((c) => [c, []]));
    if (covered.some((c) => due(before.get(c)!))) {
      let index: Map<number, DvfFile[]> | null = null;
      try {
        index = await this.dvfIndex();
      } catch (error) {
        this.logger.warn(`Index de geo-DVF illisible : ${message(error)}`);
        for (const c of covered) failed.add(c);
      }
      for (const code of index ? covered.filter((c) => due(before.get(c)!)) : []) {
        for (const [year, files] of index!) {
          const file = files.find((f) => f.department === code);
          if (!file) continue;
          const known = before.get(code)!.find((s) => s.scope === `${code}/${year}`);
          if (known?.status === 'ready' && known.version === file.modifiedAt) {
            await this.states.markReady(DVF_SOURCE, known.scope, file.modifiedAt, known.itemCount ?? 0, now);
            continue;
          }
          try {
            await this.loadDvf(code, file);
            loaded.get(code)!.push(year);
          } catch (error) {
            this.logger.warn(`DVF ${code}/${year} : ${message(error)}`);
            failed.add(code);
          }
        }
      }
    }
    return Promise.all(
      covered.map(async (code) => ({
        code,
        years: (await this.dvfStates(code))
          .filter((s) => s.version)
          .map((s) => ({ year: Number(s.scope.split('/')[1]), modifiedAt: s.version! }))
          .sort((a, b) => a.year - b.year),
        loaded: loaded.get(code)!,
        failed: failed.has(code),
      })),
    );
  }

  /** Recharge si la copie a plus de 30 jours (ou une autre version), sinon la garde ; vieille copie si la source se tait. */
  private async refresh(source: string, scope: string, version: string | null, load: () => Promise<{ version: string; count: number }>, force = false): Promise<Refreshed> {
    const now = this.clock.now();
    const known = await this.states.get(source, scope);
    const ready = known?.version && known.loadedAt ? { asOf: known.loadedAt, version: known.version } : null;
    const fresh = ready && now.getTime() - ready.asOf.getTime() < MARKET_FRESHNESS_DAYS * DAY_MS && (version === null || ready.version === version);
    if (fresh && !force) return { ...ready, origin: 'fresh' };
    await this.states.markLoading(source, scope, now);
    try {
      const r = await load();
      await this.states.markReady(source, scope, r.version, r.count, now);
      return { asOf: now, origin: 'fetched', version: r.version };
    } catch (error) {
      await this.states.markFailed(source, scope, message(error), now, false);
      if (!ready) throw error;
      // L'état garde la version et la date du dernier chargement réussi.
      await this.states.markReady(source, scope, ready.version, known!.itemCount ?? 0, ready.asOf);
      this.logger.warn(`${source} ${scope} muet : copie du ${ready.asOf.toISOString().slice(0, 10)} gardée (${message(error)})`);
      return { ...ready, origin: 'stale' };
    }
  }

  /** ECLN de toute la France ; version = dernier trimestre publié. */
  async ensureNewBuild(force = false): Promise<Refreshed> {
    return this.refresh(
      ECLN_SOURCE,
      'france',
      null,
      async () => {
        const rows = await this.dido.newBuildPrices();
        await this.repository.replaceNewBuild(rows);
        return { version: rows.reduce((v, r) => (r.quarter > v ? r.quarter : v), ''), count: rows.length };
      },
      force,
    );
  }

  /** Séries du catalogue ; version = identifiants des séries (un catalogue changé se recharge). */
  async ensureIndices(force = false): Promise<Refreshed> {
    const ids = INDEX_SERIES.map((s) => s.id);
    const version = ids.join('+');
    return this.refresh(
      INDEX_SOURCE,
      'catalog',
      version,
      async () => {
        const series = await this.insee.series(ids);
        await this.repository.replaceIndices(series);
        return { version, count: [...series.values()].reduce((n, v) => n + v.length, 0) };
      },
      force,
    );
  }

  /** Sitadel d'une commune ; version = dernière année publiée. */
  async ensurePermits(communeCode: string, force = false): Promise<Refreshed> {
    return this.refresh(
      SITADEL_SOURCE,
      communeCode,
      null,
      async () => {
        const rows = await this.dido.housingPermits(communeCode);
        await this.repository.replacePermits(communeCode, rows);
        return { version: String(rows.reduce((y, r) => Math.max(y, r.year), 0)), count: rows.length };
      },
      force,
    );
  }
}
