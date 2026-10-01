// Hauteurs d'eau des cartes des territoires à risque important d'inondation (TRI), sur le WMS
// Géorisques du BRGM (F-04) : GetFeatureInfo en un point, toutes les couches `ISO_HT_*` d'un coup.
// Le service ne rend que du GML (MapServer) et échoue entier si une couche demandée n'existe pas ;
// son WFS n'expose pas ces couches (vérifié le 01/10/2026).
import { FLOOD_LAYERS, type FloodHit, type FloodScenario, type FloodType } from '../domain/index.ts';
import { type Http, SourceError } from './http.ts';

export const FLOOD_WMS = 'https://mapsref.brgm.fr/wxs/georisques/risques';
const SOURCE = 'brgm-tri';
/** Demi-côté de la boîte d'interrogation, en degrés (≈ 10 m). */
const HALF = 0.0001;

/** Une entrée par entité `<ISO_HT_xx_yyyy_feature>` du GML de MapServer (repris de l'ancien `parseIsoHtGml`). */
export function parseFloodGml(xml: string): FloodHit[] {
  const hits: FloodHit[] = [];
  for (const layer of FLOOD_LAYERS) {
    const [, type, scenario] = /^ISO_HT_(\d{2})_(\w+)$/.exec(layer)!;
    const features = xml.matchAll(new RegExp(`<${layer}_feature>([\\s\\S]*?)</${layer}_feature>`, 'g'));
    for (const [, body = ''] of features) {
      const field = (tag: string) => Number.parseFloat(new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(body)?.[1] ?? '');
      const min = field('ht_min');
      const max = field('ht_max');
      hits.push({ type: type as FloodType, scenario: scenario as FloodScenario, heightMin: Number.isNaN(min) ? 0 : min, heightMax: Number.isNaN(max) ? 0 : max });
    }
  }
  return hits;
}

export class FloodHeights {
  constructor(private readonly http: Http) {}

  async at(lon: number, lat: number): Promise<FloodHit[]> {
    const layers = FLOOD_LAYERS.join(',');
    const bbox = [lon - HALF, lat - HALF, lon + HALF, lat + HALF].map((v) => v.toFixed(6)).join(',');
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      REQUEST: 'GetFeatureInfo',
      VERSION: '1.1.1',
      LAYERS: layers,
      QUERY_LAYERS: layers,
      STYLES: '',
      INFO_FORMAT: 'application/vnd.ogc.gml',
      FEATURE_COUNT: '30',
      SRS: 'EPSG:4326',
      BBOX: bbox,
      WIDTH: '3',
      HEIGHT: '3',
      X: '1',
      Y: '1',
    });
    const r = await this.http.get({ url: `${FLOOD_WMS}?${params}`, timeoutMs: 10_000 });
    const body = r.body.toString('utf8');
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `Hauteurs d'eau TRI : HTTP ${r.status}`);
    if (!body.includes('msGMLOutput')) throw new SourceError(SOURCE, 'invalid', 'Hauteurs d’eau TRI : réponse inattendue');
    return parseFloodGml(body);
  }
}
