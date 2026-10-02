// Cadrage d'une image de carte (vignette d'étude, F-02 Q6) : zoom, tuiles XYZ à assembler, et
// projection des coordonnées en pixels de l'image (Web Mercator, tuiles de 256 px).
import type { Bbox, Position } from './geometry.ts';

export const TILE_SIZE = 256;

export interface Frame {
  zoom: number;
  width: number;
  height: number;
  /** Tuiles à poser, avec leur position dans l'image (en pixels, parfois négative). */
  tiles: { x: number; y: number; left: number; top: number }[];
  /** `[lon, lat]` → `[x, y]` dans l'image. */
  project: (p: Position) => [number, number];
}

function worldPixel([lon = 0, lat = 0]: Position, zoom: number): [number, number] {
  const size = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
}

/**
 * Cadre l'emprise au centre d'une image `width × height`, au plus fort zoom où elle tient avec une
 * marge de `padding` (fraction de l'image) de chaque côté.
 */
export function frameBbox(bbox: Bbox, width: number, height: number, options: { minZoom?: number; maxZoom?: number; padding?: number } = {}): Frame {
  const { minZoom = 0, maxZoom = 19, padding = 0.15 } = options;
  const [w, s, e, n] = bbox;
  let zoom = maxZoom;
  for (; zoom > minZoom; zoom--) {
    const [x1, y1] = worldPixel([w, n], zoom);
    const [x2, y2] = worldPixel([e, s], zoom);
    if (x2 - x1 <= width * (1 - 2 * padding) && y2 - y1 <= height * (1 - 2 * padding)) break;
  }
  const [cx, cy] = worldPixel([(w + e) / 2, (s + n) / 2], zoom);
  // Origine entière : les tuiles tombent sur des pixels entiers, sans flou.
  const ox = Math.round(cx - width / 2);
  const oy = Math.round(cy - height / 2);
  const count = 2 ** zoom;
  const tiles: Frame['tiles'] = [];
  for (let ty = Math.floor(oy / TILE_SIZE); ty * TILE_SIZE < oy + height; ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(ox / TILE_SIZE); tx * TILE_SIZE < ox + width; tx++) {
      tiles.push({ x: ((tx % count) + count) % count, y: ty, left: tx * TILE_SIZE - ox, top: ty * TILE_SIZE - oy });
    }
  }
  return {
    zoom,
    width,
    height,
    tiles,
    project: (p) => {
      const [x, y] = worldPixel(p, zoom);
      return [x - ox, y - oy];
    },
  };
}
