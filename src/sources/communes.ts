// Référentiel des communes : `geo.api.gouv.fr` (nom, codes postaux, centre, contour ; commune d'un
// point). Paris, Lyon et Marseille sont servies par arrondissement, comme le cadastre.
import { z } from 'zod';

import { departmentOf } from '../domain/index.ts';
import type { MultiPolygon } from '../domain/index.ts';
import { type Http, SourceError } from './http.ts';

export const GEO_API_BASE = 'https://geo.api.gouv.fr';
const SOURCE = 'geo.api.gouv.fr';
/** Communes découpées en arrondissements municipaux. */
const WITH_DISTRICTS = new Set(['75056', '69123', '13055']);

const Polygonal = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(z.number()))) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(z.array(z.number())))) }),
]);

const CommuneJson = z.object({
  code: z.string(),
  nom: z.string(),
  codeDepartement: z.string().optional(),
  codesPostaux: z.array(z.string()).default([]),
  centre: z.object({ coordinates: z.tuple([z.number(), z.number()]) }).optional(),
  contour: Polygonal.optional(),
});

export interface CommuneInfo {
  code: string;
  name: string;
  departmentCode: string;
  postcodes: string[];
  center: [number, number] | null;
  contour: MultiPolygon | null;
}

export class Communes {
  constructor(private readonly http: Http) {}

  private async json(url: string): Promise<unknown | null> {
    const r = await this.http.get({ url, timeoutMs: 8_000 });
    if (r.status === 404) return null;
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `${SOURCE} : HTTP ${r.status}`);
    try {
      return JSON.parse(r.body.toString('utf8'));
    } catch {
      throw new SourceError(SOURCE, 'invalid', `${SOURCE} : réponse illisible`);
    }
  }

  /** Une commune ou un arrondissement, avec son contour ; `null` si le code n'existe pas. */
  async commune(code: string): Promise<CommuneInfo | null> {
    const params = new URLSearchParams({ fields: 'nom,code,codesPostaux,codeDepartement,centre,contour', format: 'json' });
    const raw = await this.json(`${GEO_API_BASE}/communes/${encodeURIComponent(code)}?${params}`);
    if (raw === null) return null;
    const c = CommuneJson.safeParse(raw);
    if (!c.success) throw new SourceError(SOURCE, 'invalid', `${SOURCE} : commune ${code} illisible`);
    const contour = c.data.contour;
    return {
      code: c.data.code,
      name: c.data.nom,
      departmentCode: c.data.codeDepartement ?? departmentOf(c.data.code),
      postcodes: c.data.codesPostaux,
      center: c.data.centre?.coordinates ?? null,
      contour: !contour ? null : contour.type === 'MultiPolygon' ? contour : { type: 'MultiPolygon', coordinates: [contour.coordinates] },
    };
  }

  /** Commune (ou arrondissement) qui contient le point ; `null` en mer ou hors de France. */
  async locate(lon: number, lat: number): Promise<{ code: string; name: string } | null> {
    const find = async (type?: string) => {
      const params = new URLSearchParams({ lon: lon.toFixed(6), lat: lat.toFixed(6), fields: 'nom,code', format: 'json', ...(type && { type }) });
      const list = z.array(CommuneJson.pick({ code: true, nom: true })).safeParse(await this.json(`${GEO_API_BASE}/communes?${params}`));
      if (!list.success) throw new SourceError(SOURCE, 'invalid', `${SOURCE} : réponse illisible`);
      const first = list.data[0];
      return first ? { code: first.code, name: first.nom } : null;
    };
    const found = await find();
    if (found && WITH_DISTRICTS.has(found.code)) return (await find('arrondissement-municipal')) ?? found;
    return found;
  }
}
