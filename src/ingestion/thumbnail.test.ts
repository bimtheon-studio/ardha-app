import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { rect } from '../domain/geometry.test.ts';
import { renderThumbnail, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from './thumbnail.ts';

// Tuile unie (blanche) : seul le contour des parcelles colore l'image.
const white = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#ffffff' } }).png().toBuffer();

describe('renderThumbnail', () => {
  it('assemble les tuiles et dessine les parcelles au centre de l’image', async () => {
    const asked: string[] = [];
    const png = await renderThumbnail([rect(2.4297, 48.7999, 2.43, 48.8001)], async (z, x, y) => {
      asked.push(`${z}/${x}/${y}`);
      return white;
    });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT]);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((t) => t.startsWith('19/'))).toBe(true);
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    // Centre : remplissage bleu translucide ; coin : la tuile blanche.
    const [r, g, b] = pixel(THUMBNAIL_WIDTH / 2, THUMBNAIL_HEIGHT / 2);
    expect(b).toBeGreaterThan(r! + 20);
    expect(g).toBeLessThan(230);
    expect(pixel(2, 2)).toEqual([255, 255, 255]);
  });

  it('refuse une étude sans parcelle', async () => {
    await expect(renderThumbnail([], async () => white)).rejects.toThrow('Vignette : aucune parcelle.');
  });
});
