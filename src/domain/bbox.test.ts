import { describe, expect, it } from 'vitest';

import { bboxTooLarge, formatBbox, gridCells, parseBbox } from './bbox.ts';

describe('parseBbox', () => {
  it('lit ouest,sud,est,nord', () => {
    expect(parseBbox('2.43,48.79,2.45,48.8')).toEqual([2.43, 48.79, 2.45, 48.8]);
  });

  it('refuse le reste', () => {
    for (const t of ['', '1,2,3', '2.45,48.79,2.43,48.8', '2.43,48.8,2.45,48.79', 'a,b,c,d', '1,,2,3', '-181,0,1,1', '0,-91,1,1', '0,0,181,1', '0,0,1,91', '1,2,3,4,5']) {
      expect(parseBbox(t)).toBeNull();
    }
  });

  it('formate à 6 décimales', () => {
    expect(formatBbox([2.4300000001, 48.79, 2.45, 48.8])).toBe('2.43,48.79,2.45,48.8');
  });
});

describe('taille et grille', () => {
  it('bboxTooLarge au-delà de 0,03°', () => {
    expect(bboxTooLarge([2.43, 48.79, 2.46, 48.8])).toBe(false);
    expect(bboxTooLarge([2.43, 48.79, 2.4601, 48.8])).toBe(true);
    expect(bboxTooLarge([2.43, 48.79, 2.44, 48.8201])).toBe(true);
  });

  it('découpe en cases alignées, sans case vide au bord', () => {
    expect(gridCells([2.431, 48.791, 2.449, 48.799])).toEqual([
      [2.43, 48.79, 2.44, 48.8],
      [2.44, 48.79, 2.45, 48.8],
    ]);
    expect(gridCells([2.43, 48.79, 2.44, 48.8])).toEqual([[2.43, 48.79, 2.44, 48.8]]);
    expect(gridCells([-0.005, -0.005, 0.005, 0.005])).toHaveLength(4);
  });
});
