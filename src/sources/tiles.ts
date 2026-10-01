// Tuiles de carte (PNG 256 px) pour les images composées par le worker : la vignette d'étude, sur
// fond OpenStreetMap (F-02, Q12, choix du porteur du produit). Faible volume (une vignette par
// modification de parcelles), User-Agent identifié (`http.ts`) : à servir par le fournisseur de
// tuiles prévu avant un trafic important (PLAN, journal du 01/10/2026).
import { type Http, SourceError } from './http.ts';

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© contributeurs d’OpenStreetMap';

export class Tiles {
  constructor(
    private readonly http: Http,
    private readonly template = OSM_TILES,
  ) {}

  async get(z: number, x: number, y: number): Promise<Buffer> {
    const url = this.template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    const host = new URL(url).host;
    const r = await this.http.get({ url, timeoutMs: 8_000 });
    if (r.status !== 200) throw new SourceError(host, 'unavailable', `Tuile ${z}/${x}/${y} : HTTP ${r.status}`);
    if (!r.contentType.startsWith('image/')) throw new SourceError(host, 'invalid', `Tuile ${z}/${x}/${y} : ${r.contentType || 'type inconnu'}`);
    return r.body;
  }
}
