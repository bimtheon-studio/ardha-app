// Analyse des risques d'une étude (F-04), par le worker : chaque source est interrogée à part, et une
// source qui échoue rend son axe « indisponible » sans faire tomber les autres (Q4). Communes : radon,
// sismicité, GASPAR, PPR, CatNat, installations, sols pollués. Parcelles, en un point intérieur :
// argiles, hauteurs d'eau TRI ; altitudes sur le point et le périmètre. Alentours de l'emprise :
// cavités, installations, sols pollués, bornes incendie.
import { Injectable, Logger } from '@nestjs/common';

import { type AnalysisStep, RISKS_VERSION, type RisksResult } from '../contracts/index.ts';
import { AnalysisProgress, type StepOutcome } from './analysis-progress.ts';
import {
  bboxOf,
  clayLevel,
  distanceM,
  distanceToPointM,
  elevationSamples,
  elevationStats,
  cavityProbes,
  hydrantCells,
  floodHazard,
  floodScenarios,
  HYDRANT_RADIUS_M,
  isFloodPlan,
  NEARBY_RADIUS_M,
  parcelLabel,
  type Position,
  referenceFloodHeight,
  type Surface,
  unionBbox,
} from '../domain/index.ts';
import { CommunesRepository } from '../geo/communes.repository.ts';
import { Elevation } from '../sources/elevation.ts';
import { FloodHeights } from '../sources/flood-heights.ts';
import { Georisques } from '../sources/georisques.ts';
import { HydrantCache } from './hydrant-cache.ts';
import type { StudyParcelRecord } from '../studies/studies.repository.ts';

type Known<T> = { status: 'ok'; data: T } | { status: 'unavailable'; error: string };


const round = (v: number, digits = 6) => Math.round(v * 10 ** digits) / 10 ** digits;
const lonLat = (p: Position): [number, number] => [round(p[0] ?? 0), round(p[1] ?? 0)];

export const georisquesPlanUrl = (id: string) => `https://www.georisques.gouv.fr/risques/plans-prevention-risques/donnees#/dossier/${encodeURIComponent(id)}`;

@Injectable()
export class RiskAnalyzer {
  private readonly logger = new Logger('RiskAnalyzer');

  constructor(
    private readonly georisques: Georisques,
    private readonly floodHeights: FloodHeights,
    private readonly elevation: Elevation,
    private readonly hydrants: HydrantCache,
    private readonly communes: CommunesRepository,
  ) {}

  private async known<T>(what: string, fn: () => Promise<T>): Promise<Known<T>> {
    try {
      return { status: 'ok', data: await fn() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${what} : ${message}`);
      return { status: 'unavailable', error: message };
    }
  }

  /** `persist` reçoit le déroulé à chaque étape (enregistré par l'appelant, vu pendant le calcul). */
  async analyze(parcels: readonly StudyParcelRecord[], persist: (steps: AnalysisStep[]) => Promise<void> = async () => {}): Promise<RisksResult> {
    const geometries = parcels.map((p) => p.geometry);
    const box = unionBbox(geometries.map(bboxOf))!;
    const center: Position = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    const distanceToStudy = (p: Position) => Math.min(...geometries.map((g) => distanceToPointM(g, p)));
    const codes = [...new Set(parcels.map((p) => p.communeCode))];
    const names = new Map(await Promise.all(codes.map(async (code) => [code, (await this.communes.byCode(code))?.name ?? null] as const)));
    const asked = elevationSamples(geometries);

    const progress = new AnalysisProgress(
      [
        ...codes.map((code) => ({ key: `commune-${code}`, label: `Risques de la commune : ${names.get(code) ?? code} (Géorisques)` })),
        { key: 'elevation', label: `Altitudes de ${asked.flat().length} points (IGN)` },
        ...parcels.map((p) => ({ key: `parcel-${p.id}`, label: `Argiles et hauteurs d’eau, parcelle ${parcelLabel(p)} (Géorisques, BRGM)` })),
        { key: 'cavities', label: `Cavités à moins de ${NEARBY_RADIUS_M} m (Géorisques)` },
        { key: 'hydrants', label: `Bornes incendie à moins de ${HYDRANT_RADIUS_M} m (OpenStreetMap)` },
      ],
      persist,
      () => new Date(),
    );

    const communes = [];
    const installations: Known<Awaited<ReturnType<Georisques['installations']>>>[] = [];
    const polluted: Known<Awaited<ReturnType<Georisques['pollutedSites']>>>[] = [];
    for (const code of codes) {
      const g = this.georisques;
      const [radon, seismic, hazards, plans, catnat, inst, sites] = await progress.run(
        `commune-${code}`,
        () =>
          Promise.all([
            this.known(`radon ${code}`, () => g.radon(code)),
            this.known(`sismicité ${code}`, () => g.seismic(code)),
            this.known(`GASPAR ${code}`, () => g.hazards(code)),
            this.known(`PPR ${code}`, () => g.plans(code)),
            this.known(`CatNat ${code}`, () => g.catnat(code)),
            this.known(`installations ${code}`, () => g.installations(code)),
            this.known(`sols pollués ${code}`, () => g.pollutedSites(code)),
          ]),
        ([radon, seismic, , plans, catnat, inst, sites]) =>
          outcome([
            part('radon', radon, (v) => `radon ${v ?? '?'}`),
            part('sismicité', seismic, (v) => `sismicité ${v ?? '?'}`),
            part('PPR', plans, (v) => plural(v.length, 'PPR', 'PPR')),
            part('CatNat', catnat, (v) => plural(v.items.length, 'arrêté CatNat', 'arrêtés CatNat')),
            part('installations', inst, (v) => plural(v.items.length, 'installation classée', 'installations classées')),
            part('sols pollués', sites, (v) => plural(v.items.length, 'site pollué', 'sites pollués')),
          ]),
      );
      installations.push(inst);
      polluted.push(sites);
      communes.push({
        code,
        name: names.get(code) ?? null,
        radon,
        seismic,
        hazards,
        plans:
          plans.status === 'ok'
            ? { status: 'ok' as const, data: plans.data.map((p) => ({ ...p, flood: isFloodPlan(p), url: georisquesPlanUrl(p.id) })) }
            : plans,
        catnat:
          catnat.status === 'ok'
            ? {
                status: 'ok' as const,
                data: {
                  count: catnat.data.items.length,
                  truncated: catnat.data.truncated,
                  latest: [...catnat.data.items]
                    .sort((a, b) => frenchDateKey(b.date_debut_evt).localeCompare(frenchDateKey(a.date_debut_evt)))
                    .slice(0, 10)
                    .map((c) => ({ id: c.code_national_catnat, label: c.libelle_risque_jo, start: c.date_debut_evt, published: c.date_publication_jo })),
                },
              }
            : catnat,
      });
    }

    // Altitudes : un seul appel par lots pour toutes les parcelles.
    const altitudes = await progress.run(
      'elevation',
      () => this.known('altimétrie', () => this.elevation.points(asked.flat())),
      (a) =>
        a.status === 'ok'
          ? { state: 'done', detail: `${a.data.filter((x) => x.z !== null).length} altitudes reçues` }
          : { state: 'unavailable', detail: `indisponible : ${a.error}` },
    );

    const parcelResults = [];
    let offset = 0;
    for (const [i, p] of parcels.entries()) {
      const point = asked[i]![0]!;
      const [clay, flood] = await progress.run(
        `parcel-${p.id}`,
        () =>
          Promise.all([
            this.known(`argiles ${p.id}`, () => this.georisques.clay(point[0]!, point[1]!).then(clayLevel)),
            this.known(`TRI ${p.id}`, () => this.floodHeights.at(point[0]!, point[1]!)),
          ]),
        ([c, f]) =>
          outcome([
            part('argiles', c, (v) => `argiles ${v ?? 'hors zone'}`),
            part('hauteurs d’eau', f, (v) => (v.length === 0 ? 'hors zone inondable (TRI)' : `inondable, aléa ${floodHazard(v)}`)),
          ]),
      );
      const zs = altitudes.status === 'ok' ? altitudes.data.slice(offset, offset + asked[i]!.length).flatMap((a) => (a.z === null ? [] : [a.z])) : [];
      offset += asked[i]!.length;
      const stats = elevationStats(zs);
      const floodData =
        flood.status === 'ok' ? { hazard: floodHazard(flood.data), scenarios: floodScenarios(flood.data), reference: referenceFloodHeight(flood.data) } : null;
      const reference = floodData?.reference;
      const level = stats && reference ? { level: Math.round((stats.mean + reference.height) * 100) / 100, atLeast: reference.atLeast } : null;
      parcelResults.push({
        id: p.id,
        label: parcelLabel(p),
        point: lonLat(point),
        clay,
        flood: floodData ? { status: 'ok' as const, data: floodData } : (flood as Known<never>),
        elevation: altitudes.status === 'ok' ? { status: 'ok' as const, data: stats && { ...stats, points: zs.length } } : altitudes,
        floodLevel: level,
      });
    }

    const nearby = <T extends { distanceM: number }>(items: T[]) => items.filter((i) => i.distanceM <= NEARBY_RADIUS_M).sort((a, b) => a.distanceM - b.distanceM);
    const merge = <T>(parts: Known<{ items: T[]; truncated: boolean }>[]): Known<{ items: T[]; truncated: boolean }> => {
      const failed = parts.find((p) => p.status === 'unavailable');
      if (failed) return failed;
      const ok = parts as { status: 'ok'; data: { items: T[]; truncated: boolean } }[];
      return { status: 'ok', data: { items: ok.flatMap((p) => p.data.items), truncated: ok.some((p) => p.data.truncated) } };
    };

    const cavities = await progress.run(
      'cavities',
      // Un point par case occupée par l'étude (pas le centre de l'emprise, qui peut tomber loin de tout).
      () =>
        this.known('cavités', async () => {
          const found = new Map<string, Awaited<ReturnType<Georisques['cavities']>>['items'][number]>();
          let truncated = false;
          for (const [lon, lat] of cavityProbes(geometries)) {
            const r = await this.georisques.cavities(lon!, lat!, NEARBY_RADIUS_M);
            truncated ||= r.truncated;
            for (const c of r.items) found.set(c.identifiant, c);
          }
          return { items: [...found.values()], truncated };
        }),
      (c) => outcome([part('cavités', c, (v) => plural(v.items.length, 'cavité recensée', 'cavités recensées') + ` à ${NEARBY_RADIUS_M} m`)]),
    );
    const hydrants = await progress.run(
      'hydrants',
      () => this.known('bornes incendie', () => this.hydrants.inCells(hydrantCells(geometries))),
      (h) =>
        h.status === 'ok'
          ? { state: 'done', detail: `${plural(h.data.items.length, 'borne', 'bornes')} dans la zone ; ${describeCells(h.data.cells)}` }
          : { state: 'unavailable', detail: `indisponible : ${h.error}` },
    );
    const allInstallations = merge(installations);
    const allPolluted = merge(polluted);

    return {
      version: RISKS_VERSION,
      communes,
      parcels: parcelResults,
      center: lonLat(center),
      radii: { nearbyM: NEARBY_RADIUS_M, hydrantsM: HYDRANT_RADIUS_M },
      cavities:
        cavities.status === 'ok'
          ? {
              status: 'ok',
              data: {
                truncated: cavities.data.truncated,
                items: nearby(cavities.data.items.map((c) => ({ id: c.identifiant, name: c.nom, type: c.type, point: lonLat([c.longitude, c.latitude]), distanceM: Math.round(distanceToStudy([c.longitude, c.latitude])) }))),
              },
            }
          : cavities,
      installations:
        allInstallations.status === 'ok'
          ? {
              status: 'ok',
              data: {
                count: allInstallations.data.items.length,
                truncated: allInstallations.data.truncated,
                items: nearby(
                  allInstallations.data.items.flatMap((i) =>
                    i.longitude === null || i.latitude === null
                      ? []
                      : [{ id: i.codeAIOT, name: i.raisonSociale, regime: i.regime, seveso: i.statutSeveso, point: lonLat([i.longitude, i.latitude]), distanceM: Math.round(distanceToStudy([i.longitude, i.latitude])) }],
                  ),
                ),
              },
            }
          : allInstallations,
      pollutedSites:
        allPolluted.status === 'ok'
          ? {
              status: 'ok',
              data: {
                count: allPolluted.data.items.length,
                truncated: allPolluted.data.truncated,
                items: nearby(
                  allPolluted.data.items.flatMap((s) =>
                    s.geometry ? [{ id: s.id, kind: s.kind, name: s.name, url: s.url, distanceM: Math.round(Math.min(...geometries.map((g) => distanceM(g, s.geometry as Surface)))) }] : [],
                  ),
                ),
              },
            }
          : allPolluted,
      hydrants:
        hydrants.status === 'ok'
          ? {
              status: 'ok',
              data: {
                asOf: hydrants.data.asOf.toISOString(),
                items: hydrants.data.items
                  .map((h) => ({ id: h.id, point: lonLat([h.lon, h.lat]), type: h.type, flowRate: h.flowRate, diameter: h.diameter, ref: h.ref, distanceM: Math.round(distanceToStudy([h.lon, h.lat])) }))
                  .filter((h) => h.distanceM <= HYDRANT_RADIUS_M)
                  .sort((a, b) => a.distanceM - b.distanceM),
              },
            }
          : hydrants,
    };
  }
}

function plural(n: number, one: string, many: string): string {
  return n === 0 ? `aucun${one.endsWith('e') && !one.endsWith('é') ? 'e' : ''} ${one}` : `${n} ${n > 1 ? many : one}`;
}

interface Part {
  what: string;
  /** Nul : la source n'a pas répondu. */
  text: string | null;
}

/** Ce qu'une source a donné à l'étape, mis en mots. */
function part<T>(what: string, k: Known<T>, show: (v: T) => string): Part {
  return { what, text: k.status === 'ok' ? show(k.data) : null };
}

/** Commentaire d'une étape : ce que chaque source a donné, et lesquelles n'ont pas répondu. */
function outcome(parts: Part[]): StepOutcome {
  const ok = parts.flatMap((p) => (p.text === null ? [] : [p.text]));
  const off = parts.filter((p) => p.text === null).map((p) => p.what);
  if (ok.length === 0) return { state: 'unavailable', detail: `sources muettes : ${off.join(', ')}` };
  return { state: off.length ? 'partial' : 'done', detail: [...ok, ...(off.length ? [`sans réponse : ${off.join(', ')}`] : [])].join(' · ') };
}

/** « 4 cases en cache », « 2 cases interrogées », « 1 case ancienne gardée (Overpass en panne) ». */
function describeCells(c: { fresh: number; fetched: number; stale: number }): string {
  const parts = [];
  if (c.fresh) parts.push(`${c.fresh} case${c.fresh > 1 ? 's' : ''} en cache`);
  if (c.fetched) parts.push(`${c.fetched} case${c.fetched > 1 ? 's' : ''} interrogée${c.fetched > 1 ? 's' : ''}`);
  if (c.stale) parts.push(`${c.stale} case${c.stale > 1 ? 's' : ''} ancienne${c.stale > 1 ? 's' : ''} gardée${c.stale > 1 ? 's' : ''} (Overpass indisponible)`);
  return parts.join(', ');
}

/** « 23/07/1988 » → « 1988-07-23 », pour trier. */
export function frenchDateKey(date: string | null): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
