// Emprises demandées à l'API : lecture, contrôle de taille, découpage en cases régulières (le front
// demande les parcelles case par case, ce qui rend chaque réponse réutilisable en cache).
import type { Bbox } from './geometry.ts';

/** Plus grand côté d'une emprise de parcelles, en degrés (≈ 3,3 km en latitude). */
export const PARCELS_BBOX_MAX_SPAN = 0.03;
/** Côté des cases, en degrés (≈ 1,1 km × 0,7 km en France métropolitaine). */
export const GRID_STEP = 0.01;

/** `ouest,sud,est,nord` en degrés, ou `null` si le texte n'est pas une emprise valide. */
export function parseBbox(text: string): Bbox | null {
  const parts = text.split(',');
  if (parts.length !== 4 || parts.some((p) => p.trim() === '')) return null;
  const [w, s, e, n] = parts.map(Number) as [number, number, number, number];
  if (![w, s, e, n].every(Number.isFinite)) return null;
  if (w < -180 || e > 180 || s < -90 || n > 90 || w >= e || s >= n) return null;
  return [w, s, e, n];
}

export function formatBbox(b: Bbox): string {
  return b.map((v) => Number(v.toFixed(6))).join(',');
}

export function bboxTooLarge(b: Bbox, maxSpan = PARCELS_BBOX_MAX_SPAN): boolean {
  return b[2] - b[0] > maxSpan + 1e-9 || b[3] - b[1] > maxSpan + 1e-9;
}

/** Cases de la grille qui recouvrent l'emprise, alignées sur des multiples de `step`. */
export function gridCells(b: Bbox, step = GRID_STEP): Bbox[] {
  const cells: Bbox[] = [];
  for (let x = Math.floor(b[0] / step); x < Math.ceil(b[2] / step - 1e-9); x++) {
    for (let y = Math.floor(b[1] / step); y < Math.ceil(b[3] / step - 1e-9); y++) {
      const round = (i: number) => Number((i * step).toFixed(6));
      cells.push([round(x), round(y), round(x + 1), round(y + 1)]);
    }
  }
  return cells;
}
