import { describe, expect, it } from 'vitest';

import { comparableOf, dedupMutations, type DvfMutation, type DvfRow, isComparableNature, isDvfCovered, isVefaNature } from './dvf.ts';

// Repris de l'ancien `_shared/__tests__/dvf.test.ts` @2a7f9a0, et complété des ventes retenues (Q3).

const row = (over: Partial<DvfRow> = {}): DvfRow => ({
  mutationId: '2024-1',
  date: '2024-03-15',
  nature: 'Vente',
  price: 300_000,
  streetNumber: '',
  streetSuffix: '',
  streetName: '',
  postcode: '94700',
  communeCode: '94046',
  parcelId: '940460000AY0096',
  localType: '',
  builtArea: null,
  rooms: null,
  cultureCode: '',
  landArea: null,
  lon: 2.43,
  lat: 48.81,
  ...over,
});

describe('dedupMutations', () => {
  it('une maison et son terrain en trois lignes font une vente', () => {
    const [m, ...rest] = dedupMutations([
      row({ localType: 'Maison', builtArea: 120, rooms: 5, cultureCode: 'S', landArea: 400, streetNumber: '13', streetSuffix: 'B', streetName: 'RUE DES ÉCOLES' }),
      row({ cultureCode: 'S', landArea: 400 }),
      row({ cultureCode: 'J', landArea: 250 }),
    ]);
    expect(rest).toEqual([]);
    expect(m).toMatchObject({
      id: '2024-1',
      price: 300_000,
      propertyType: 'house',
      dwellingCount: 1,
      builtArea: 120,
      landArea: 650,
      rooms: 5,
      address: '13B RUE DES ÉCOLES',
      postcode: '94700',
      position: [2.43, 48.81],
      cultures: ['J', 'S'],
      locals: [{ type: 'house', area: 120, rooms: 5 }],
    });
  });

  it('un local répété par culture compte une fois ; plusieurs logements, pas de pièces', () => {
    const [m] = dedupMutations([
      row({ localType: 'Appartement', builtArea: 60, rooms: 3 }),
      row({ localType: 'Appartement', builtArea: 60, rooms: 3 }),
      row({ localType: 'Appartement', builtArea: 45, rooms: 2, parcelId: '940460000AY0097' }),
      row({ localType: 'Dépendance' }),
    ]);
    expect(m).toMatchObject({ propertyType: 'apartment', dwellingCount: 2, builtArea: 105, rooms: null });
    expect(m!.parcelIds).toEqual(['940460000AY0096', '940460000AY0097']);
  });

  it('deux mutations restent deux ; une vente sans prix est écartée', () => {
    const out = dedupMutations([row(), row({ mutationId: '2024-2' }), row({ mutationId: '2024-3', price: null }), row({ mutationId: '2024-4', price: 0 })]);
    expect(out.map((m) => m.id)).toEqual(['2024-1', '2024-2']);
  });

  it('sans identifiant, regroupe par date, prix et parcelle', () => {
    const out = dedupMutations([row({ mutationId: '' }), row({ mutationId: '' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('2024-03-15|300000|940460000AY0096');
  });

  it('type dominant : logement, puis local, puis dépendance ; terrain ; ni l’un ni l’autre', () => {
    const type = (rows: DvfRow[]) => dedupMutations(rows)[0]!.propertyType;
    expect(type([row({ localType: 'Dépendance' }), row({ localType: 'Local industriel. commercial ou assimilé', builtArea: 80 })])).toBe('commercial');
    expect(type([row({ localType: 'Dépendance' })])).toBe('outbuilding');
    expect(type([row({ cultureCode: 'AB', landArea: 500 })])).toBe('land');
    expect(type([row({ localType: 'Inconnu' })])).toBe('other');
  });

  it('sans coordonnées ni adresse ni code postal : nuls', () => {
    const [m] = dedupMutations([row({ lon: null, lat: null, postcode: '', localType: 'Maison' })]);
    expect(m).toMatchObject({ position: null, address: null, postcode: null, builtArea: null, landArea: null, dwellingCount: 1 });
  });

  it('adresse prise sur une ligne de terrain s’il n’y a pas de local adressé', () => {
    const [m] = dedupMutations([row({ localType: 'Maison', builtArea: 90 }), row({ streetName: 'AVENUE FOCH', landArea: 300 })]);
    expect(m!.address).toBe('AVENUE FOCH');
  });
});

describe('natures', () => {
  it('reconnaît la VEFA quels que soient la casse, les accents et l’apostrophe', () => {
    expect(isVefaNature('Vente en l\'état futur d\'achèvement')).toBe(true);
    expect(isVefaNature('VENTE EN L’ETAT FUTUR D’ACHEVEMENT')).toBe(true);
    expect(isVefaNature('Vente')).toBe(false);
  });

  it('retient ventes, terrains à bâtir et VEFA ; écarte adjudications, échanges, expropriations', () => {
    for (const n of ['Vente', 'Vente terrain à bâtir', 'Vente en l\'état futur d\'achèvement']) expect(isComparableNature(n)).toBe(true);
    for (const n of ['Adjudication', 'Echange', 'Expropriation']) expect(isComparableNature(n)).toBe(false);
  });
});

describe('isDvfCovered', () => {
  it('exclut Alsace-Moselle et Mayotte ; couvre Paris, la Corse et La Réunion', () => {
    expect(['67482', '68224', '57463', '97611'].map(isDvfCovered)).toEqual([false, false, false, false]);
    expect(['75111', '2A004', '97411'].map(isDvfCovered)).toEqual([true, true, true]);
  });
});

describe('comparableOf', () => {
  const sale = (over: Partial<DvfMutation> = {}) => ({
    nature: 'Vente',
    vefa: false,
    price: 300_000,
    locals: [{ type: 'house' as const, area: 100, rooms: 4 }],
    dwellingCount: 1,
    builtArea: 100,
    landArea: 400,
    cultures: ['S'],
    ...over,
  });

  it('une maison ancienne : prix au m² bâti', () => {
    expect(comparableOf(sale())).toEqual({ category: 'house', segment: 'existing', pricePerM2: 3000 });
  });

  it('un appartement en VEFA, avec sa dépendance', () => {
    const m = sale({ vefa: true, nature: 'Vente en l\'état futur d\'achèvement', locals: [{ type: 'apartment', area: 50, rooms: 2 }, { type: 'outbuilding', area: null, rooms: null }], builtArea: 50 });
    expect(comparableOf(m)).toEqual({ category: 'apartment', segment: 'new', pricePerM2: 6000 });
  });

  it('un terrain urbain : prix au m² de terrain', () => {
    expect(comparableOf(sale({ locals: [], dwellingCount: 0, builtArea: null, landArea: 600, cultures: ['AB'] }))).toEqual({ category: 'land', segment: 'existing', pricePerM2: 500 });
  });

  it('écarte nature, prix symbolique, terrain agricole ou en VEFA, plusieurs logements, local d’activité, petite surface, hors bornes', () => {
    const rejected = [
      sale({ nature: 'Adjudication' }),
      sale({ price: 4000 }),
      sale({ locals: [], cultures: ['P', 'T'] }),
      sale({ locals: [], vefa: true }),
      sale({ locals: [], landArea: null }),
      sale({ dwellingCount: 2 }),
      sale({ locals: [{ type: 'outbuilding', area: null, rooms: null }], dwellingCount: 1 }),
      sale({ locals: [{ type: 'house', area: 100, rooms: 4 }, { type: 'commercial', area: 40, rooms: null }] }),
      sale({ builtArea: 8 }),
      sale({ builtArea: null }),
      sale({ price: 2_100_000 }),
      sale({ price: 30_000 }),
    ];
    expect(rejected.map(comparableOf)).toEqual(rejected.map(() => null));
  });
});
