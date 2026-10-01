// Analyse des risques d'une étude (F-04), par le worker : chaque source est interrogée à part, et une
// source qui échoue rend son axe « indisponible » sans faire tomber les autres (Q4). Communes : radon,
// sismicité, GASPAR, PPR, CatNat, installations, sols pollués. Parcelles, en un point intérieur :
// argiles, hauteurs d'eau TRI ; altitudes sur le point et le périmètre. Alentours de l'emprise :
// cavités, installations, sols pollués, bornes incendie.
import { Injectable, Logger } from '@nestjs/common';

import { RISKS_VERSION, type RisksResult } from '../contracts/index.ts';
import {
  bboxOf,
  clayLevel,
  distanceM,
  distanceToPointM,
  elevationStats,
  expandBbox,
  floodHazard,
  floodScenarios,
  HYDRANT_RADIUS_M,
  interiorPoint,
  isFloodPlan,
  NEARBY_RADIUS_M,
  parcelLabel,
  perimeterPoints,
  type Position,
  referenceFloodHeight,
  type Surface,
  unionBbox,
} from '../domain/index.ts';
import { CommunesRepository } from '../geo/communes.repository.ts';
import { Elevation } from '../sources/elevation.ts';
import { FloodHeights } from '../sources/flood-heights.ts';
import { Georisques } from '../sources/georisques.ts';
import { Hydrants } from '../sources/hydrants.ts';
import type { StudyParcelRecord } from '../studies/studies.repository.ts';

type Known<T> = { status: 'ok'; data: T } | { status: 'unavailable'; error: string };

/** Points d'altitude par parcelle (le point intérieur, puis le périmètre tous les 15 m), et en tout. */
const ELEVATION_PER_PARCEL = 40;
const ELEVATION_TOTAL = 300;
const PERIMETER_STEP_M = 15;

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
    private readonly hydrants: Hydrants,
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

  async analyze(parcels: readonly StudyParcelRecord[]): Promise<RisksResult> {
    const geometries = parcels.map((p) => p.geometry);
    const box = unionBbox(geometries.map(bboxOf))!;
    const center: Position = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    const distanceToStudy = (p: Position) => Math.min(...geometries.map((g) => distanceToPointM(g, p)));
    const codes = [...new Set(parcels.map((p) => p.communeCode))];

    const communes = [];
    const installations: Known<Awaited<ReturnType<Georisques['installations']>>>[] = [];
    const polluted: Known<Awaited<ReturnType<Georisques['pollutedSites']>>>[] = [];
    for (const code of codes) {
      const g = this.georisques;
      const [name, radon, seismic, hazards, plans, catnat, inst, sites] = await Promise.all([
        this.communes.byCode(code).then((c) => c?.name ?? null),
        this.known(`radon ${code}`, () => g.radon(code)),
        this.known(`sismicité ${code}`, () => g.seismic(code)),
        this.known(`GASPAR ${code}`, () => g.hazards(code)),
        this.known(`PPR ${code}`, () => g.plans(code)),
        this.known(`CatNat ${code}`, () => g.catnat(code)),
        this.known(`installations ${code}`, () => g.installations(code)),
        this.known(`sols pollués ${code}`, () => g.pollutedSites(code)),
      ]);
      installations.push(inst);
      polluted.push(sites);
      communes.push({
        code,
        name,
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
    const samples = parcels.map((p) => [interiorPoint(p.geometry), ...perimeterPoints(p.geometry, PERIMETER_STEP_M, ELEVATION_PER_PARCEL - 1)]);
    const perParcel = Math.max(2, Math.floor(ELEVATION_TOTAL / Math.max(1, parcels.length)));
    const asked = samples.map((s) => s.slice(0, perParcel));
    const altitudes = await this.known('altimétrie', () => this.elevation.points(asked.flat()));

    const parcelResults = [];
    let offset = 0;
    for (const [i, p] of parcels.entries()) {
      const point = asked[i]![0]!;
      const [clay, flood] = await Promise.all([
        this.known(`argiles ${p.id}`, () => this.georisques.clay(point[0] ?? 0, point[1] ?? 0).then(clayLevel)),
        this.known(`TRI ${p.id}`, () => this.floodHeights.at(point[0] ?? 0, point[1] ?? 0)),
      ]);
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

    const cavities = await this.known('cavités', () => this.georisques.cavities(center[0] ?? 0, center[1] ?? 0, NEARBY_RADIUS_M));
    const hydrants = await this.known('bornes incendie', () => this.hydrants.inBbox(expandBbox(box, HYDRANT_RADIUS_M)));
    const allInstallations = merge(installations);
    const allPolluted = merge(polluted);

    return {
      version: RISKS_VERSION,
      communes,
      parcels: parcelResults,
      center: lonLat(center),
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
                items: hydrants.data
                  .map((h) => ({ id: h.id, point: lonLat([h.lon, h.lat]), type: h.type, flowRate: h.flowRate, diameter: h.diameter, ref: h.ref, distanceM: Math.round(distanceToStudy([h.lon, h.lat])) }))
                  .filter((h) => h.distanceM <= HYDRANT_RADIUS_M)
                  .sort((a, b) => a.distanceM - b.distanceM),
              },
            }
          : hydrants,
    };
  }
}

/** « 23/07/1988 » → « 1988-07-23 », pour trier. */
export function frenchDateKey(date: string | null): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
