import { describe, expect, it } from 'vitest';

import { areaM2, bboxOf, containsPoint, distanceM, type MultiPolygon, type Polygon, unionBbox } from './geometry.ts';

/** Rectangle `[ouest, sud, est, nord]` en degrés. */
export function rect(w: number, s: number, e: number, n: number): Polygon {
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

const square = rect(2.44, 48.8, 2.441, 48.801);

describe('areaM2', () => {
  // Références : ST_Area(geography) de PostGIS 3.6, sur l'ellipsoïde (30/09/2026).
  it('suit PostGIS à 10⁻⁵ près, en métropole et outre-mer', () => {
    expect(areaM2(square)).toBeCloseTo(8169.58, -1);
    expect(Math.abs(areaM2(square) / 8169.582249 - 1)).toBeLessThan(1e-5);
    expect(Math.abs(areaM2(rect(0.68, 47.39, 0.6812, 47.3905)) / 5036.413359 - 1)).toBeLessThan(1e-5);
    expect(Math.abs(areaM2(rect(-61, 14.6, -60.999, 14.601)) / 11921.715274 - 1)).toBeLessThan(1e-5);
  });

  it('déduit les trous, additionne les polygones, et ignore le sens de parcours', () => {
    const holed: Polygon = { type: 'Polygon', coordinates: [square.coordinates[0]!, rect(2.4402, 48.8002, 2.4404, 48.8004).coordinates[0]!] };
    expect(Math.abs(areaM2(holed) / 7842.797672 - 1)).toBeLessThan(1e-5);
    const multi: MultiPolygon = { type: 'MultiPolygon', coordinates: [square.coordinates, [[...square.coordinates[0]!].reverse()]] };
    expect(areaM2(multi)).toBeCloseTo(2 * areaM2(square), 6);
    expect(areaM2({ type: 'MultiPolygon', coordinates: [[]] })).toBe(0);
  });
});

describe('emprises', () => {
  it('bboxOf et unionBbox', () => {
    expect(bboxOf(square)).toEqual([2.44, 48.8, 2.441, 48.801]);
    expect(unionBbox([bboxOf(square), [2.43, 48.81, 2.435, 48.82]])).toEqual([2.43, 48.8, 2.441, 48.82]);
    expect(unionBbox([])).toBeNull();
  });
});

describe('containsPoint', () => {
  it('dans le polygone, hors du polygone, dans un trou', () => {
    const holed: Polygon = { type: 'Polygon', coordinates: [square.coordinates[0]!, rect(2.4402, 48.8002, 2.4404, 48.8004).coordinates[0]!] };
    expect(containsPoint(holed, [2.4401, 48.8001])).toBe(true);
    expect(containsPoint(holed, [2.4403, 48.8003])).toBe(false);
    expect(containsPoint(holed, [2.45, 48.8])).toBe(false);
    expect(containsPoint({ type: 'Polygon', coordinates: [] }, [2.44, 48.8])).toBe(false);
  });
});

describe('distanceM', () => {
  it('0 pour deux parcelles qui partagent un bord sans sommet commun (l’ancien test les rejetait)', () => {
    // Le côté ouest de la seconde est sur le côté est de la première, décalé : aucun sommet commun.
    expect(distanceM(square, rect(2.441, 48.8003, 2.442, 48.8007))).toBeLessThan(1e-6);
  });

  it('suit PostGIS pour un petit écart, à l’est comme au nord', () => {
    expect(distanceM(square, rect(2.44101, 48.8003, 2.442, 48.8007))).toBeCloseTo(0.7346, 3);
    expect(distanceM(square, rect(2.4403, 48.801005, 2.4406, 48.8015))).toBeCloseTo(0.5559, 3);
  });

  it('0 quand l’une recouvre l’autre ou que leurs bords se croisent', () => {
    expect(distanceM(square, rect(2.4402, 48.8002, 2.4404, 48.8004))).toBe(0);
    expect(distanceM(rect(2.4402, 48.8002, 2.4404, 48.8004), square)).toBe(0);
    expect(distanceM(square, rect(2.4405, 48.8005, 2.442, 48.802))).toBe(0);
    // Une croix : les bords se croisent, aucun sommet n'est dans l'autre.
    expect(distanceM(rect(2.44, 48.8004, 2.441, 48.8006), rect(2.4404, 48.8, 2.4406, 48.801))).toBe(0);
  });

  it('répond Infinity sans calcul quand les emprises sont trop loin', () => {
    expect(distanceM(square, rect(2.45, 48.8, 2.451, 48.801), 1)).toBe(Infinity);
    expect(distanceM(square, rect(2.45, 48.8, 2.451, 48.801))).toBeGreaterThan(660);
  });

  it('tient un segment dégénéré (deux sommets confondus)', () => {
    const degenerate: Polygon = { type: 'Polygon', coordinates: [[[2.442, 48.8], [2.442, 48.8], [2.443, 48.8], [2.443, 48.801], [2.442, 48.8]]] };
    expect(distanceM(square, degenerate)).toBeGreaterThan(70);
  });
});
