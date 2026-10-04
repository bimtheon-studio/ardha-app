// API DiDo du service statistique du ministère (SDES), F-05 Q6 et Q7 :
//  - ECLN, commercialisation des logements neufs : un fichier national, trimestriel, par
//    département et type (collectif, individuel, tous) ; 1,6 Mo, chargé en entier ;
//  - Sitadel, logements autorisés et commencés par commune et par an, filtré côté serveur.
// Colonnes relevées le 02/10/2026. Une commune sans donnée Sitadel répond 400 « Le fichier est vide ».
import type { HousingType, NewBuildRow, PermitRow } from '../domain/index.ts';
import { splitCsvLine } from './dvf.ts';
import { type Http, SourceError } from './http.ts';

export type { NewBuildRow, PermitRow };

export const DIDO_BASE = 'https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles';
export const ECLN_FILE = '95e4190c-4d70-403f-9537-5b71fd005b1c';
export const SITADEL_FILE = '9c90a880-4ba0-49b4-b99d-d7dd6c810dd0';
const SOURCE = 'dido';
const CSV_OPTIONS = 'withColumnName=true&withColumnDescription=false';

/** Lignes d'un CSV DiDo (séparateur `;`), par nom de colonne. */
export function parseDidoCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0] ?? '', ';').map((h) => h.trim().toUpperCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, ';');
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

const num = (v: string | undefined) => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ECLN_TYPES: Record<string, HousingType> = { Collectif: 'collective', Individuel: 'individual', 'Tous logements': 'all' };

const PERMIT_TYPES: Record<string, string> = {
  'Tous Logements': 'all',
  'Individuel pur': 'individual-detached',
  'Individuel groupe': 'individual-grouped',
  Collectif: 'collective',
  Residence: 'residence',
};

export class Dido {
  constructor(private readonly http: Http) {}

  private async csv(file: string, filter = ''): Promise<Record<string, string>[] | null> {
    const r = await this.http.get({ url: `${DIDO_BASE}/${file}/csv?${filter}${CSV_OPTIONS}`, timeoutMs: 30_000 });
    const body = r.body.toString('utf8');
    if (r.status === 400 && body.includes('vide')) return null;
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `DiDo : HTTP ${r.status}`);
    return parseDidoCsv(body);
  }

  /** Tout l'ECLN, tous départements et trimestres. */
  async newBuildPrices(): Promise<NewBuildRow[]> {
    const rows = (await this.csv(ECLN_FILE)) ?? [];
    if (rows.length === 0 || !('PRIX_M2' in rows[0]!)) throw new SourceError(SOURCE, 'invalid', 'ECLN : en-tête inattendu');
    return rows
      .filter((r) => r.DEP_CODE && r.TRIMESTRE && ECLN_TYPES[r.TYPE_LGT!])
      .map((r) => ({
        department: r.DEP_CODE!,
        quarter: r.TRIMESTRE!,
        housingType: ECLN_TYPES[r.TYPE_LGT!]!,
        listed: num(r.MEV),
        reservations: num(r.RESA),
        cancellations: num(r.ANNUL),
        stock: num(r.STOCK),
        monthsToSell: num(r.DELAI_ECOUL),
        // 0 € : trimestre sans réservation, pas un prix.
        pricePerM2: num(r.PRIX_M2) || null,
        averagePrice: num(r.PRIX_MOY_IND) || null,
      }));
  }

  /** Logements autorisés et commencés d'une commune, toutes années ; vide si la commune n'en a pas. */
  async housingPermits(communeCode: string): Promise<PermitRow[]> {
    const rows = await this.csv(SITADEL_FILE, `COMM=eq:${communeCode}&`);
    if (!rows) return [];
    if (rows.length > 0 && !('LOG_AUT' in rows[0]!)) throw new SourceError(SOURCE, 'invalid', 'Sitadel : en-tête inattendu');
    return rows
      .filter((r) => PERMIT_TYPES[r.TYPE_LGT!] && num(r.ANNEE))
      .map((r) => ({
        communeCode,
        year: num(r.ANNEE)!,
        housingType: PERMIT_TYPES[r.TYPE_LGT!]!,
        authorizedUnits: num(r.LOG_AUT),
        startedUnits: num(r.LOG_COM),
        authorizedArea: num(r.SDP_AUT),
        startedArea: num(r.SDP_COM),
      }));
  }
}
