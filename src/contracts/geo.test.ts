import { describe, expect, it } from 'vitest';

import { AddressSearch, ParcelsQuery, Point } from './geo.ts';

describe('contrat de la carte', () => {
  it('recherche d’adresse : 3 à 200 caractères, 5 suggestions par défaut', () => {
    expect(AddressSearch.parse({ q: '  9 rue Pasteur ' })).toEqual({ q: '9 rue Pasteur', limit: 5 });
    expect(AddressSearch.parse({ q: 'Tours', limit: '10' }).limit).toBe(10);
    expect(AddressSearch.safeParse({ q: 'x'.repeat(201) }).error?.issues[0]?.message).toBe('Adresse trop longue.');
    expect(AddressSearch.safeParse({}).error?.issues[0]?.message).toBe('Saisissez une adresse.');
  });

  it('point : longitude et latitude lues depuis la chaîne de requête', () => {
    expect(Point.parse({ lon: '2.43', lat: '48.8' })).toEqual({ lon: 2.43, lat: 48.8 });
    expect(Point.safeParse({ lon: 'x', lat: '100' }).error?.issues.map((i) => i.message)).toEqual(['Longitude invalide.', 'Latitude invalide.']);
  });

  it('parcelles : une emprise ou des identifiants, pas les deux', () => {
    expect(ParcelsQuery.safeParse({ bbox: '1,2,3,4' }).success).toBe(true);
    expect(ParcelsQuery.safeParse({ ids: '37023000AB0001,37023000AB0002' }).success).toBe(true);
    expect(ParcelsQuery.safeParse({ bbox: '1,2,3,4', ids: '37023000AB0001' }).success).toBe(false);
  });
});
