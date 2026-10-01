import { describe, expect, it } from 'vitest';

import { copyName, parcelsKey, principalCommune, proposeStudyName, STUDY_NAME_MAX, studySteps } from './study.ts';

const today = new Date('2026-10-01T10:00:00Z');
const ay96 = { prefix: '000', section: 'AY', number: '0096' };
const ay97 = { prefix: '000', section: 'AY', number: '0097' };
const ay98 = { prefix: '000', section: 'AY', number: '0098' };

describe('proposeStudyName', () => {
  it('adresse avec numéro, suffixe selon le nombre de parcelles', () => {
    const address = { kind: 'housenumber' as const, name: '2 Rue Étienne Dolet', city: 'Maisons-Alfort' };
    expect(proposeStudyName({ address, parcels: [ay96], communeName: 'Maisons-Alfort', today })).toBe('2 Rue Étienne Dolet, Maisons-Alfort');
    expect(proposeStudyName({ address, parcels: [ay96, ay97], communeName: 'Maisons-Alfort', today })).toBe(
      '2 Rue Étienne Dolet, Maisons-Alfort (+1 parcelle)',
    );
    expect(proposeStudyName({ address, parcels: [ay96, ay97, ay98], communeName: 'Maisons-Alfort', today })).toBe(
      '2 Rue Étienne Dolet, Maisons-Alfort (+2 parcelles)',
    );
  });

  it('une voie sans numéro n’est pas un lieu-dit (B14) ; un toponyme l’est', () => {
    expect(proposeStudyName({ address: { kind: 'street', name: 'Rue de Morette', city: 'Annecy' }, parcels: [ay96], communeName: 'Annecy', today })).toBe(
      'Rue de Morette, Annecy',
    );
    expect(proposeStudyName({ address: { kind: 'locality', name: 'Les Fourches', city: 'Beaumont-Village' }, parcels: [ay96], communeName: null, today })).toBe(
      'Lieu-dit Les Fourches, Beaumont-Village',
    );
  });

  it('sans adresse : commune et 1ʳᵉ parcelle ; sans commune : la date', () => {
    expect(proposeStudyName({ address: null, parcels: [ay96, ay97], communeName: 'Maisons-Alfort', today })).toBe('Maisons-Alfort — AY 96 (+1 parcelle)');
    expect(proposeStudyName({ address: { kind: 'municipality', name: 'Annecy', city: 'Annecy' }, parcels: [], communeName: 'Annecy', today })).toBe('Annecy');
    expect(proposeStudyName({ address: null, parcels: [], communeName: null, today })).toBe('Étude du 01/10/2026');
  });

  it('borne la longueur sans couper le suffixe', () => {
    const name = proposeStudyName({ address: { kind: 'street', name: 'x'.repeat(200), city: 'Y' }, parcels: [ay96, ay97], communeName: null, today });
    expect(name).toHaveLength(STUDY_NAME_MAX);
    expect(name.endsWith(' (+1 parcelle)')).toBe(true);
    expect(copyName('y'.repeat(200))).toHaveLength(STUDY_NAME_MAX);
    expect(copyName('Étude')).toBe('Étude (copie)');
  });
});

describe('parcelsKey', () => {
  it('ne dépend ni de l’ordre ni des doublons, change avec les parcelles', () => {
    const a = parcelsKey(['94046000AY0096', '94046000AY0097']);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(parcelsKey(['94046000AY0097', '94046000AY0096', '94046000AY0097'])).toBe(a);
    expect(parcelsKey(['94046000AY0096'])).not.toBe(a);
  });
});

describe('studySteps', () => {
  it('seules les parcelles sont faites en L2 ; les autres étapes attendent leur lot', () => {
    const steps = studySteps({ parcelCount: 2 });
    expect(steps.map((s) => s.key)).toEqual(['parcels', 'urbanism', 'risks', 'land', 'feasibility', 'report']);
    expect(steps[0]).toEqual({ key: 'parcels', label: 'Parcelles', state: 'done', lot: null });
    expect(steps.slice(1).every((s) => s.state === 'upcoming' && s.lot)).toBe(true);
    expect(studySteps({ parcelCount: 0 })[0]!.state).toBe('todo');
  });
});

describe('principalCommune', () => {
  it('la commune qui porte la plus grande surface, la première à égalité', () => {
    expect(principalCommune([{ communeCode: 'a', area: 10 }, { communeCode: 'b', area: 8 }, { communeCode: 'b', area: 8 }])).toBe('b');
    expect(principalCommune([{ communeCode: 'a', area: 10 }, { communeCode: 'b', area: 10 }])).toBe('a');
    expect(principalCommune([])).toBeNull();
  });
});
