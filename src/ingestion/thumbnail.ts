// Vignette d'étude (F-02, Q6) : tuiles assemblées, contours des parcelles par-dessus, cadrée sur
// l'emprise. PNG en palette : quelques dizaines de Ko.
import sharp, { type OverlayOptions } from 'sharp';

import { bboxOf, frameBbox, polygonsOf, type Surface, unionBbox } from '../domain/index.ts';

export const THUMBNAIL_WIDTH = 480;
export const THUMBNAIL_HEIGHT = 300;
const COLOR = '#0033A8';

export async function renderThumbnail(parcels: readonly Surface[], tile: (z: number, x: number, y: number) => Promise<Buffer>): Promise<Buffer> {
  const bbox = unionBbox(parcels.map(bboxOf));
  if (!bbox) throw new Error('Vignette : aucune parcelle.');
  const frame = frameBbox(bbox, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { maxZoom: 19, minZoom: 3 });
  const layers: OverlayOptions[] = [];
  for (const t of frame.tiles) {
    // Partie de la tuile qui tombe dans l'image (sharp refuse les décalages négatifs).
    const left = Math.max(0, -t.left);
    const top = Math.max(0, -t.top);
    const width = Math.min(256, THUMBNAIL_WIDTH - t.left) - left;
    const height = Math.min(256, THUMBNAIL_HEIGHT - t.top) - top;
    const input = await sharp(await tile(frame.zoom, t.x, t.y)).extract({ left, top, width, height }).png().toBuffer();
    layers.push({ input, left: t.left + left, top: t.top + top });
  }
  const paths = parcels
    .flatMap((g) => polygonsOf(g))
    .map((rings) => rings.map((r) => `M${r.map((p) => frame.project(p).map((v) => v.toFixed(1)).join(' ')).join(' L')} Z`).join(' '));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}">${paths
    .map((d) => `<path d="${d}" fill="${COLOR}" fill-opacity="0.25" fill-rule="evenodd" stroke="${COLOR}" stroke-width="2.5" stroke-linejoin="round"/>`)
    .join('')}</svg>`;
  layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
  return sharp({ create: { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT, channels: 3, background: '#f2efe9' } })
    .composite(layers)
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();
}
