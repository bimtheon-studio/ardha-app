// Altimétrie de l'IGN (Géoplateforme, sans clé), RGE ALTI au pas de 1 m (F-04) : altitude de points,
// en m NGF-IGN69 (IGN78 en Corse). En GET, par lots (l'URL sature vers 400 points) ; `z ≤ -99` veut
// dire « pas de donnée ».
import { z } from 'zod';

import type { Position } from '../domain/index.ts';
import { type Http, SourceError } from './http.ts';

export const ELEVATION_URL = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
export const ELEVATION_RESOURCE = 'ign_rge_alti_wld';
const SOURCE = 'ign-altimetrie';
const BATCH = 100;

const Response = z.object({ elevations: z.array(z.object({ lon: z.number(), lat: z.number(), z: z.number() })) });

export interface ElevationPoint {
  lon: number;
  lat: number;
  /** Nulle hors de la couverture. */
  z: number | null;
}

export class Elevation {
  constructor(private readonly http: Http) {}

  async points(points: readonly Position[]): Promise<ElevationPoint[]> {
    const out: ElevationPoint[] = [];
    for (let i = 0; i < points.length; i += BATCH) {
      const batch = points.slice(i, i + BATCH);
      const params = new URLSearchParams({
        lon: batch.map((p) => (p[0] ?? 0).toFixed(6)).join('|'),
        lat: batch.map((p) => (p[1] ?? 0).toFixed(6)).join('|'),
        resource: ELEVATION_RESOURCE,
        zonly: 'false',
      });
      const r = await this.http.get({ url: `${ELEVATION_URL}?${params}`, timeoutMs: 15_000 });
      if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `Altimétrie IGN : HTTP ${r.status}`);
      let parsed;
      try {
        parsed = Response.parse(JSON.parse(r.body.toString('utf8')));
      } catch {
        throw new SourceError(SOURCE, 'invalid', 'Altimétrie IGN : réponse illisible');
      }
      out.push(...parsed.elevations.map((e) => ({ lon: e.lon, lat: e.lat, z: e.z <= -99 ? null : Math.round(e.z * 100) / 100 })));
    }
    return out;
  }
}
