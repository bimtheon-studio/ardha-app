// Géocodage de la Géoplateforme (BAN) : `data.geopf.fr/geocodage`. Le repli sur
// `api-adresse.data.gouv.fr`, en fin de vie depuis le 31/01/2026, est abandonné (F-01, #1).
import { z } from 'zod';

import type { Address } from '../contracts/index.ts';
import { type Http, SourceError } from './http.ts';

export const GEOCODING_BASE = 'https://data.geopf.fr/geocodage';
const SOURCE = 'geocodage';

const Feature = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    id: z.string(),
    label: z.string(),
    context: z.string().default(''),
    type: z.enum(['housenumber', 'street', 'locality', 'municipality']),
    citycode: z.string(),
    city: z.string(),
    postcode: z.string().optional(),
    score: z.number().default(0),
  }),
});
const Response = z.object({ features: z.array(z.unknown()) });

function toAddress(raw: unknown): Address | null {
  const r = Feature.safeParse(raw);
  if (!r.success) return null;
  const { geometry, properties: p } = r.data;
  return {
    id: p.id,
    label: p.label,
    context: p.context,
    kind: p.type,
    lon: geometry.coordinates[0],
    lat: geometry.coordinates[1],
    communeCode: p.citycode,
    city: p.city,
    postcode: p.postcode ?? null,
    score: p.score,
  };
}

export class Geocoding {
  constructor(private readonly http: Http) {}

  private async read(url: string): Promise<Address[]> {
    const r = await this.http.get({ url, timeoutMs: 4_000 });
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `Géocodage : HTTP ${r.status}`);
    const parsed = Response.safeParse(JSON.parse(r.body.toString('utf8')));
    if (!parsed.success) throw new SourceError(SOURCE, 'invalid', 'Géocodage : réponse illisible');
    return parsed.data.features.map(toAddress).filter((a): a is Address => a !== null);
  }

  search(q: string, limit: number): Promise<Address[]> {
    const params = new URLSearchParams({ q, limit: String(limit), index: 'address' });
    return this.read(`${GEOCODING_BASE}/search?${params}`);
  }

  async reverse(lon: number, lat: number): Promise<Address | null> {
    const params = new URLSearchParams({ lon: lon.toFixed(6), lat: lat.toFixed(6), limit: '1', index: 'address' });
    return (await this.read(`${GEOCODING_BASE}/reverse?${params}`))[0] ?? null;
  }
}
