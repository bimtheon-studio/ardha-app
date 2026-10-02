// Séries de la Banque de données macroéconomiques de l'INSEE (SDMX 2.1 « StructureSpecific »), F-05
// Q8 : toutes les séries du catalogue en une requête (`id1+id2+…`). Format relu le 02/10/2026 :
// `<Series … IDBANK="000008630" …><Obs TIME_PERIOD="2026-Q2" OBS_VALUE="2103" …/></Series>`.
// Repris de l'ancien `_shared/insee-bdm.ts` @2a7f9a0.
import type { IndexValue } from '../domain/index.ts';
import { type Http, SourceError } from './http.ts';

export const BDM_SDMX = 'https://bdm.insee.fr/series/sdmx/data/SERIES_BDM';
const SOURCE = 'insee-bdm';
/** Première période demandée. */
export const INDEX_START = '2015';

/** Observations par identifiant de série. */
export function parseSdmxSeries(xml: string): Map<string, IndexValue[]> {
  const out = new Map<string, IndexValue[]>();
  for (const [, attributes = '', body = ''] of xml.matchAll(/<Series\s([^>]*)>([\s\S]*?)<\/Series>/g)) {
    const id = /IDBANK="([^"]+)"/.exec(attributes)?.[1];
    if (!id) continue;
    const values: IndexValue[] = [];
    for (const [obs] of body.matchAll(/<Obs\s[^>]*>/g)) {
      const period = /TIME_PERIOD="([^"]+)"/.exec(obs)?.[1];
      const value = Number(/OBS_VALUE="([^"]+)"/.exec(obs)?.[1] ?? 'NaN');
      if (period && Number.isFinite(value)) values.push({ period, value });
    }
    out.set(id, values);
  }
  return out;
}

export class Insee {
  constructor(private readonly http: Http) {}

  async series(ids: readonly string[]): Promise<Map<string, IndexValue[]>> {
    const r = await this.http.get({ url: `${BDM_SDMX}/${ids.join('+')}?startPeriod=${INDEX_START}`, timeoutMs: 20_000 });
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `INSEE : HTTP ${r.status}`);
    const xml = r.body.toString('utf8');
    if (!xml.includes('StructureSpecificData')) throw new SourceError(SOURCE, 'invalid', 'INSEE : réponse inattendue');
    return parseSdmxSeries(xml);
  }
}
