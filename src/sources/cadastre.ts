// Cadastre Etalab (DGFiP, retraité par Etalab), publié par millésime trimestriel et par commune :
// https://cadastre.data.gouv.fr/data/etalab-cadastre/<millésime>/geojson/communes/<dép>/<code>/
import { gunzipSync } from 'node:zlib';

import { z } from 'zod';

import { departmentOf, type MultiPolygon, parseParcelId } from '../domain/index.ts';
import { type Http, SourceError } from './http.ts';

export const CADASTRE_BASE = 'https://cadastre.data.gouv.fr/data/etalab-cadastre';
const SOURCE = 'cadastre.data.gouv.fr';

export interface CadastreParcel {
  id: string;
  prefix: string;
  section: string;
  number: string;
  contenance: number | null;
  geometry: MultiPolygon;
}

export interface CadastreFile {
  version: string;
  parcels: CadastreParcel[];
  /** Entités écartées (identifiant ou géométrie illisible). */
  skipped: number;
}

const Feature = z.object({
  id: z.string().optional(),
  properties: z.object({ id: z.string().optional(), contenance: z.number().nullable().optional() }),
  geometry: z.discriminatedUnion('type', [
    z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(z.number()))) }),
    z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(z.array(z.number())))) }),
  ]),
});

export function parcelsUrl(version: string, code: string): string {
  return `${CADASTRE_BASE}/${version}/geojson/communes/${departmentOf(code)}/${code}/cadastre-${code}-parcelles.json.gz`;
}

export class Cadastre {
  constructor(private readonly http: Http) {}

  /** Millésimes publiés, du plus récent au plus ancien (lus dans l'index du répertoire). */
  async versions(): Promise<string[]> {
    const r = await this.http.get({ url: `${CADASTRE_BASE}/`, timeoutMs: 10_000 });
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `${SOURCE} : HTTP ${r.status}`);
    const found = [...r.body.toString('utf8').matchAll(/etalab-cadastre\/(\d{4}-\d{2}-\d{2})\//g)].map((m) => m[1]!);
    const versions = [...new Set(found)].sort().reverse();
    if (versions.length === 0) throw new SourceError(SOURCE, 'invalid', `${SOURCE} : aucun millésime publié`);
    return versions;
  }

  /**
   * Parcelles d'une commune au plus récent millésime qui la publie : un millésime tout juste ouvert
   * peut ne pas encore contenir toutes les communes. `null` si aucun des trois derniers ne l'a.
   */
  async latestParcels(code: string): Promise<CadastreFile | null> {
    for (const version of (await this.versions()).slice(0, 3)) {
      const file = await this.parcels(code, version);
      if (file) return file;
    }
    return null;
  }

  async parcels(code: string, version: string): Promise<CadastreFile | null> {
    const r = await this.http.get({ url: parcelsUrl(version, code), timeoutMs: 60_000 });
    if (r.status === 404) return null;
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `${SOURCE} : HTTP ${r.status}`);
    let json: unknown;
    try {
      // Le fichier est servi compressé tel quel ; un relais peut l'avoir déjà décompressé.
      const gzip = r.body[0] === 0x1f && r.body[1] === 0x8b;
      json = JSON.parse((gzip ? gunzipSync(r.body) : r.body).toString('utf8'));
    } catch {
      throw new SourceError(SOURCE, 'invalid', `${SOURCE} : fichier de ${code} illisible`);
    }
    const features = z.object({ features: z.array(z.unknown()) }).safeParse(json);
    if (!features.success) throw new SourceError(SOURCE, 'invalid', `${SOURCE} : fichier de ${code} illisible`);
    const parcels: CadastreParcel[] = [];
    let skipped = 0;
    for (const raw of features.data.features) {
      const f = Feature.safeParse(raw);
      const ref = f.success ? parseParcelId(f.data.id ?? f.data.properties.id ?? '') : null;
      if (!f.success || !ref) {
        skipped++;
        continue;
      }
      const g = f.data.geometry;
      parcels.push({
        id: `${ref.commune}${ref.prefix}${ref.section}${ref.number}`,
        prefix: ref.prefix,
        section: ref.section,
        number: ref.number,
        contenance: f.data.properties.contenance ?? null,
        geometry: g.type === 'MultiPolygon' ? g : { type: 'MultiPolygon', coordinates: [g.coordinates] },
      });
    }
    return { version, parcels, skipped };
  }
}
