import { describe, expect, it } from 'vitest';

import { type AddressCandidate, chooseAddress, probePoints, rankAddresses, streetRank } from './addresses.ts';
import { rect } from './geometry.test.ts';

// Parcelle d'environ 70 × 110 m.
const parcel = rect(2.44, 48.8, 2.441, 48.801);

function address(id: string, over: Partial<AddressCandidate> = {}): AddressCandidate {
  return { id, kind: 'housenumber', name: `1 Rue ${id}`, street: `Rue ${id}`, lon: 2.4405, lat: 48.8005, score: 0.9, ...over };
}

describe('probePoints', () => {
  it('centre puis milieux des côtés, plafonnés à 12', () => {
    expect(probePoints([parcel])).toEqual([
      [2.4405, 48.8005],
      [2.4405, 48.8],
      [2.4405, 48.801],
      [2.44, 48.8005],
      [2.441, 48.8005],
    ]);
    const many = Array.from({ length: 5 }, (_, i) => rect(2.44 + i * 0.001, 48.8, 2.441 + i * 0.001, 48.801));
    const points = probePoints(many);
    expect(points).toHaveLength(12);
    // Les cinq centres d'abord.
    expect(points.slice(0, 5).map((p) => p[1])).toEqual([48.8005, 48.8005, 48.8005, 48.8005, 48.8005]);
  });
});

describe('streetRank', () => {
  it('boulevard > avenue > route > rue > chemin > impasse, allée… > autre', () => {
    expect(['Boulevard X', 'Bd X', 'Avenue X', 'Route X', 'Rue X', 'Chemin X', 'Allée X', 'Quai X', 'Square X', null].map(streetRank)).toEqual([
      6, 6, 5, 4, 3, 2, 1, 1, 0, 0,
    ]);
    expect(streetRank('Rue')).toBe(3);
    expect(streetRank('Ruelle X')).toBe(0);
  });
});

describe('rankAddresses', () => {
  it('garde les adresses à moins de 10 m du polygone, pas de sa boîte (B13)', () => {
    const inside = address('a');
    const near = address('b', { lon: 2.44106, lat: 48.8005 }); // ≈ 4 m à l'est
    const far = address('c', { lon: 2.4413, lat: 48.8005 }); // ≈ 22 m
    expect(rankAddresses([far, near, inside], [parcel]).map((a) => a.id).sort()).toEqual(['a', 'b']);
    // Parcelle en L : la boîte couvre le coin vide, le polygone non.
    const l = { type: 'Polygon' as const, coordinates: [[[2.44, 48.8], [2.441, 48.8], [2.441, 48.8003], [2.4403, 48.8003], [2.4403, 48.801], [2.44, 48.801], [2.44, 48.8]]] };
    expect(rankAddresses([address('d', { lon: 2.4408, lat: 48.8008 })], [l])).toEqual([]);
  });

  it('voie la plus importante, puis plus petit numéro, puis score ; toponymes en dernier ; sans doublon', () => {
    const ranked = rankAddresses(
      [
        address('rue-12', { name: '12 Rue Haute', street: 'Rue Haute' }),
        address('lieu', { kind: 'locality', name: 'Les Prés', street: null, score: 0.99 }),
        address('rue-4', { name: '4 Rue Haute', street: 'Rue Haute', score: 0.5 }),
        address('av', { name: '30 Avenue Foch', street: 'Avenue Foch' }),
        address('rue-4b', { name: '4 Rue Basse', street: 'Rue Basse', score: 0.8 }),
        address('voie', { kind: 'street', name: 'Rue Haute', street: 'Rue Haute' }),
        address('av', { name: '30 Avenue Foch', street: 'Avenue Foch' }),
        address('commune', { kind: 'municipality', name: 'X', street: null }),
        address('sans-numero', { name: 'bis Rue Haute', street: 'Rue Haute', score: 0.1 }),
      ],
      [parcel],
    );
    expect(ranked.map((a) => a.id)).toEqual(['av', 'rue-4b', 'rue-4', 'rue-12', 'voie', 'sans-numero', 'lieu']);
  });
});

describe('chooseAddress', () => {
  it('le choix de l’utilisateur s’il est toujours trouvé, sinon la principale', () => {
    const ranked = [address('a'), address('b')];
    expect(chooseAddress(ranked, 'b')?.id).toBe('b');
    expect(chooseAddress(ranked, 'z')?.id).toBe('a');
    expect(chooseAddress(ranked, null)?.id).toBe('a');
    expect(chooseAddress([], 'a')).toBeNull();
  });
});
