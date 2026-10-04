// Analyse des risques d'une étude (F-04), côté API et CLI : lire l'analyse (et si elle est périmée),
// la demander au worker. La synthèse des quatre axes est recalculée à chaque lecture depuis le
// résultat enregistré : une règle corrigée s'applique sans refaire l'analyse.
import { Injectable } from '@nestjs/common';

import { RISKS_VERSION, RisksPartial, RisksResult, type StudyRisks } from '../contracts/index.ts';
import { type AxesInput, type Known, type Level, riskAxes, riskSurcharges, worstLevel } from '../domain/index.ts';
import { Clock } from '../shared/clock.ts';
import { AnalysesRepository } from './analyses.repository.ts';
import { ANALYZE_RISKS_JOB, StudyJobs } from './studies.jobs.ts';
import { type Actor, StudiesService } from './studies.service.ts';

export const RISK_SOURCES: StudyRisks['sources'] = [
  { key: 'georisques', label: 'Géorisques (BRGM, ministère de la Transition écologique)', url: 'https://www.georisques.gouv.fr', licence: 'Licence ouverte 2.0' },
  { key: 'tri', label: 'Cartes des territoires à risque important d’inondation (TRI), hauteurs d’eau', url: 'https://www.georisques.gouv.fr/donnees/bases-de-donnees/zonages-inondation-rapportage-2020', licence: 'Licence ouverte 2.0' },
  { key: 'altimetrie', label: 'IGN, RGE ALTI® (altitudes NGF-IGN69, IGN78 en Corse)', url: 'https://geoservices.ign.fr/rgealti', licence: 'Licence ouverte 2.0' },
  { key: 'osm', label: 'Bornes incendie : contributeurs d’OpenStreetMap (indicatif)', url: 'https://www.openstreetmap.org/copyright', licence: 'ODbL' },
];

type Ok<T> = { status: 'ok'; data: T };
const isOk = <T>(k: { status: string }): k is Ok<T> => k.status === 'ok';

/** Pire valeur connue ; « indisponible » si une source muette pourrait cacher pire (Q4). */
function worst<T>(values: { status: string; data?: T }[], pick: (known: T[]) => T, top: (v: T) => boolean): Known<T> {
  const known = values.filter(isOk<T>).map((v) => v.data);
  const best = pick(known);
  if (values.some((v) => v.status !== 'ok') && !top(best)) return 'unavailable';
  return best;
}

export function axesInput(r: Pick<RisksResult, 'communes' | 'parcels'>): AxesInput {
  const maxClass = (vs: (number | null)[]) => vs.reduce<number | null>((m, v) => (v !== null && (m === null || v > m) ? v : m), null);
  return {
    floodHazard: worst<Level | null>(
      r.parcels.map((p) => (p.flood.status === 'ok' ? { status: 'ok', data: p.flood.data.hazard } : p.flood)),
      worstLevel,
      (v) => v === 'fort',
    ),
    floodPlan: worst<boolean>(
      r.communes.map((c) => (c.plans.status === 'ok' ? { status: 'ok', data: c.plans.data.some((p) => p.flood) } : c.plans)),
      (vs) => vs.some(Boolean),
      Boolean,
    ),
    clay: worst<Level | null>(r.parcels.map((p) => p.clay), worstLevel, (v) => v === 'fort'),
    radon: worst<number | null>(r.communes.map((c) => c.radon), maxClass, (v) => v === 3),
    seismic: worst<number | null>(r.communes.map((c) => c.seismic), maxClass, (v) => v === 5),
  };
}

@Injectable()
export class RisksService {
  constructor(
    private readonly studies: StudiesService,
    private readonly analyses: AnalysesRepository,
    private readonly jobs: StudyJobs,
    private readonly clock: Clock,
  ) {}

  async get(actor: Actor, id: string): Promise<StudyRisks> {
    const study = await this.studies.require(actor, id);
    const row = await this.analyses.get(id, 'risks');
    if (!row) return { status: 'none', stale: false, requestedAt: null, computedAt: null, error: null, result: null, partial: null, axes: null, surcharges: null, sources: RISK_SOURCES, progress: [] };
    // Un résultat d'une ancienne version du schéma ne se lit plus : il est à refaire.
    const parsed = RisksResult.safeParse(row.result);
    const result = parsed.success ? parsed.data : null;
    // Pendant le calcul, la synthèse suit le nouveau résultat, dès que communes et parcelles sont là.
    const busy = row.status === 'queued' || row.status === 'running';
    const partialParsed = busy ? RisksPartial.safeParse(row.partial) : null;
    const partial = partialParsed?.success ? partialParsed.data : null;
    const shown = busy ? partial : result;
    const input = shown?.communes && shown.parcels ? axesInput({ communes: shown.communes, parcels: shown.parcels }) : null;
    return {
      status: row.status,
      stale: row.parcelsKey !== study.parcelsKey || (row.result !== null && (row.result as { version?: number }).version !== RISKS_VERSION),
      requestedAt: row.requestedAt.toISOString(),
      computedAt: row.computedAt?.toISOString() ?? null,
      error: row.error,
      result,
      partial,
      axes: input && riskAxes(input),
      surcharges: input && riskSurcharges(input),
      sources: RISK_SOURCES,
      progress: row.progress,
    };
  }

  /**
   * Demande l'analyse pour les parcelles actuelles ; sans effet si elle est à jour ou en cours, sauf
   * `force`. `worker: false` (CLI `--inline`) : la demande est notée, l'appelant calcule lui-même.
   */
  async request(actor: Actor, id: string, force = false, options: { worker?: boolean } = {}): Promise<StudyRisks> {
    const study = await this.studies.require(actor, id, { editable: true });
    const { queued } = await this.analyses.request(id, 'risks', study.parcelsKey, this.clock.now(), force);
    if (queued && options.worker !== false) await this.jobs.enqueue({ studyId: id, parcelsKey: study.parcelsKey, ...(force && { force }) }, [ANALYZE_RISKS_JOB]);
    return this.get(actor, id);
  }
}
