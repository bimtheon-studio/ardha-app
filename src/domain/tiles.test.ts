import { describe, expect, it } from 'vitest';

import { frameBbox, TILE_SIZE } from './tiles.ts';

describe('frameBbox', () => {
  // AY96 + AY97 à Maisons-Alfort : environ 30 × 25 m.
  const bbox = [2.43215, 48.80105, 2.43255, 48.80128] as const;

  it('prend le plus fort zoom où l’emprise tient avec sa marge, et la centre', () => {
    const f = frameBbox(bbox, 480, 300);
    expect(f.zoom).toBe(19);
    const [x1, y1] = f.project([bbox[0], bbox[3]]);
    const [x2, y2] = f.project([bbox[2], bbox[1]]);
    expect((x1 + x2) / 2).toBeCloseTo(240, 0);
    expect((y1 + y2) / 2).toBeCloseTo(150, 0);
    const wide = frameBbox([2.4, 48.78, 2.46, 48.82], 480, 300);
    expect(wide.zoom).toBe(12);
    const [a] = wide.project([2.4, 48.8]);
    const [b] = wide.project([2.46, 48.8]);
    expect(b - a).toBeLessThanOrEqual(480 * 0.7);
  });

  it('couvre toute l’image de tuiles, sans trou ni excès', () => {
    const f = frameBbox(bbox, 480, 300);
    for (const t of f.tiles) {
      // Chaque tuile mord sur l'image.
      expect(t.left).toBeGreaterThan(-TILE_SIZE);
      expect(t.top).toBeGreaterThan(-TILE_SIZE);
      expect(t.left).toBeLessThan(480);
      expect(t.top).toBeLessThan(300);
    }
    // Chaque pixel de l'image est couvert.
    for (let x = 0; x < 480; x += 8) {
      for (let y = 0; y < 300; y += 8) {
        expect(f.tiles.some((t) => x >= t.left && x < t.left + TILE_SIZE && y >= t.top && y < t.top + TILE_SIZE)).toBe(true);
      }
    }
    expect(f.tiles.length).toBeLessThanOrEqual(9);
    // Tuile z19 du centre de l'emprise : x = 265 686, y = 180 492.
    expect(f.tiles.some((t) => t.x === 265686 && t.y === 180492)).toBe(true);
  });

  it('respecte le zoom minimal et ne sort pas du monde', () => {
    const f = frameBbox([-180, -85, 180, 85], 256, 256, { minZoom: 0 });
    expect(f.zoom).toBe(0);
    expect(f.tiles.every((t) => t.y === 0 && t.x === 0)).toBe(true);
  });
});
