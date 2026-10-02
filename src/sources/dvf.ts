// Ventes DVF géolocalisées d'Etalab (geo-DVF, F-05 Q1) : un fichier par millésime et par
// département, publié deux fois par an (avril, octobre), qui remplace le précédent. L'index du
// répertoire donne la taille et la date de chaque fichier : la date sert de version, sans
// télécharger le fichier. Cerema (`apidf`) répond 503 depuis le 27/09/2026 et n'est plus utilisé.
import { gunzipSync } from 'node:zlib';

import type { DvfRow } from '../domain/index.ts';
import { type Http, SourceError } from './http.ts';

export const GEO_DVF_BASE = 'https://files.data.gouv.fr/geo-dvf/latest/csv';
const SOURCE = 'geo-dvf';

export interface DvfFile {
  year: number;
  department: string;
  size: number;
  /** Date du fichier (ISO), sa version. */
  modifiedAt: string;
}

/** Découpe une ligne CSV séparée par des virgules, guillemets compris. */
export function splitCsvLine(line: string, separator = ','): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === separator && !quoted) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  out.push(current);
  return out;
}

const num = (v: string | undefined) => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Lignes d'un fichier geo-DVF (en-tête d'Etalab, colonnes lues par leur nom). */
export function parseGeoDvfCsv(text: string): DvfRow[] {
  const lines = text.split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '');
  const at = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  if (at.id_mutation === undefined || at.valeur_fonciere === undefined) {
    throw new SourceError(SOURCE, 'invalid', 'geo-DVF : en-tête inattendu');
  }
  const rows: DvfRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = splitCsvLine(line);
    const get = (name: string) => c[at[name]!] ?? '';
    rows.push({
      mutationId: get('id_mutation'),
      date: get('date_mutation'),
      nature: get('nature_mutation'),
      price: num(get('valeur_fonciere')),
      streetNumber: get('adresse_numero'),
      streetSuffix: get('adresse_suffixe'),
      streetName: get('adresse_nom_voie'),
      postcode: get('code_postal'),
      communeCode: get('code_commune'),
      parcelId: get('id_parcelle'),
      localType: get('type_local'),
      builtArea: num(get('surface_reelle_bati')),
      rooms: num(get('nombre_pieces_principales')),
      cultureCode: get('code_nature_culture'),
      landArea: num(get('surface_terrain')),
      lon: num(get('longitude')),
      lat: num(get('latitude')),
    });
  }
  return rows;
}

export class GeoDvf {
  constructor(private readonly http: Http) {}

  private async text(url: string, timeoutMs = 15_000): Promise<string> {
    const r = await this.http.get({ url, timeoutMs });
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `geo-DVF : HTTP ${r.status}`);
    return r.body.toString('utf8');
  }

  /** Millésimes publiés, du plus ancien au plus récent. */
  async years(): Promise<number[]> {
    const html = await this.text(`${GEO_DVF_BASE}/`);
    const years = [...html.matchAll(/href="\/geo-dvf\/latest\/csv\/(\d{4})\/"/g)].map((m) => Number(m[1]));
    if (years.length === 0) throw new SourceError(SOURCE, 'invalid', 'geo-DVF : aucun millésime dans l’index');
    return [...new Set(years)].sort();
  }

  /** Fichiers départementaux d'un millésime, avec leur taille et leur date. */
  async departmentFiles(year: number): Promise<DvfFile[]> {
    const html = await this.text(`${GEO_DVF_BASE}/${year}/departements/`);
    const pattern = /departements\/([0-9AB]{2,3})\.csv\.gz">[^<]*<\/a><\/td>\s*<td>(\d+)<\/td>\s*<td>([^<]+)<\/td>/g;
    return [...html.matchAll(pattern)].map((m) => ({ year, department: m[1]!, size: Number(m[2]), modifiedAt: m[3]!.trim() }));
  }

  /** Toutes les lignes d'un département pour un millésime ; `null` si le fichier n'existe pas. */
  async departmentRows(year: number, department: string): Promise<DvfRow[] | null> {
    const r = await this.http.get({ url: `${GEO_DVF_BASE}/${year}/departements/${department}.csv.gz`, timeoutMs: 120_000 });
    if (r.status === 404) return null;
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `geo-DVF ${department}/${year} : HTTP ${r.status}`);
    let text: string;
    try {
      text = gunzipSync(r.body).toString('utf8');
    } catch {
      throw new SourceError(SOURCE, 'invalid', `geo-DVF ${department}/${year} : fichier illisible`);
    }
    return parseGeoDvfCsv(text);
  }
}
