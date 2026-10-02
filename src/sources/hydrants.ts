// Bornes et poteaux incendie d'OpenStreetMap (`emergency=fire_hydrant`), par l'API Overpass (F-04,
// Q7) : donnée **indicative**, contributive, sans valeur de conformité DECI. Instance principale
// seulement ; données sous licence ODbL.
import { z } from 'zod';

import type { Bbox } from '../domain/index.ts';
import { type Http, SourceError } from './http.ts';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const SOURCE = 'osm-overpass';

const Node = z.object({
  id: z.number(),
  lat: z.number(),
  lon: z.number(),
  tags: z.record(z.string(), z.string()).default({}),
});
const Response = z.object({ elements: z.array(z.unknown()) });

export interface Hydrant {
  id: string;
  lon: number;
  lat: number;
  /** `pillar` (poteau), `underground` (bouche)… */
  type: string | null;
  /** Débit, en m³/h, tel que renseigné. */
  flowRate: string | null;
  diameter: string | null;
  ref: string | null;
}

export class Hydrants {
  constructor(private readonly http: Http) {}

  async inBbox(bbox: Bbox): Promise<Hydrant[]> {
    return this.inBboxes([bbox]);
  }

  /**
   * Bornes de plusieurs emprises en **une seule** requête : Overpass fait surtout attendre (3 à 5 s,
   * autant pour une case que pour neuf, mesuré le 02/10/2026), pas calculer.
   */
  async inBboxes(bboxes: readonly Bbox[]): Promise<Hydrant[]> {
    const nodes = bboxes.map(([w, s, e, n]) => `node["emergency"="fire_hydrant"](${[s, w, n, e].map((v) => v.toFixed(5)).join(',')});`);
    // Une emprise : la requête d'avant, telle quelle (réponses enregistrées comprises).
    const query = `[out:json][timeout:15];${nodes.length === 1 ? nodes[0] : `(${nodes.join('')});`}out body;`;
    const r = await this.http.get({ url: `${OVERPASS_URL}?${new URLSearchParams({ data: query })}`, timeoutMs: 20_000 });
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `Overpass : HTTP ${r.status}`);
    let elements: unknown[];
    try {
      elements = Response.parse(JSON.parse(r.body.toString('utf8'))).elements;
    } catch {
      // Overpass répond parfois 200 avec une page d'erreur HTML (instance surchargée).
      throw new SourceError(SOURCE, 'unavailable', 'Overpass : réponse illisible (instance surchargée ?)');
    }
    return elements.flatMap((raw) => {
      const node = Node.safeParse(raw);
      if (!node.success) return [];
      const t = node.data.tags;
      return [
        {
          id: `node/${node.data.id}`,
          lon: node.data.lon,
          lat: node.data.lat,
          type: t['fire_hydrant:type'] ?? null,
          flowRate: t['fire_hydrant:flow_rate'] ?? t['flow_rate'] ?? null,
          diameter: t['fire_hydrant:diameter'] ?? null,
          ref: t['ref'] ?? null,
        },
      ];
    });
  }
}
