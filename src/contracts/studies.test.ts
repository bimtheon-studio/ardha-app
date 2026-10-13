import { describe, expect, it } from 'vitest';

import { StudiesQuery, StudyCreate, StudyUpdate } from './studies.ts';

const AY96 = '94046000AY0096';

describe('contrat de l’étude', () => {
  it('création : 1 à 50 parcelles valides, sans doublon', () => {
    expect(StudyCreate.parse({ parcelIds: [AY96] })).toEqual({ parcelIds: [AY96] });
    const message = (v: unknown) => StudyCreate.safeParse(v).error?.issues[0]?.message;
    expect(message({ parcelIds: [] })).toBe('Sélectionnez au moins une parcelle.');
    expect(message({})).toBe('Sélectionnez au moins une parcelle.');
    expect(message({ parcelIds: ['x'] })).toBe('Identifiant de parcelle invalide.');
    expect(message({ parcelIds: [AY96, AY96] })).toBe('Parcelle en double.');
    expect(message({ parcelIds: Array.from({ length: 51 }, (_, i) => `94046000AY${String(i).padStart(4, '0')}`) })).toBe(
      'Une étude compte au plus 50 parcelles.',
    );
  });

  it('création : destinations facultatives, normalisées, la principale en tête (F-02b)', () => {
    expect(StudyCreate.parse({ parcelIds: [AY96], destinations: ['31', 'housing', 'retail'] })).toEqual({ parcelIds: [AY96], destinations: ['retail', 'housing'] });
    const message = (v: unknown) => StudyCreate.safeParse(v).error?.issues[0]?.message;
    expect(message({ parcelIds: [AY96], destinations: [] })).toBe('Choisissez au moins une destination.');
    expect(message({ parcelIds: [AY96], destinations: ['bureaux'] })).toBe('Destination inconnue : bureaux.');
    expect(message({ parcelIds: [AY96], destinations: 'housing' })).toBe('Destinations invalides.');
  });

  it('modification : les destinations seules suffisent', () => {
    expect(StudyUpdate.parse({ destinations: ['office', '53', 'retail'] })).toEqual({ destinations: ['office', 'retail'] });
    expect(StudyUpdate.safeParse({ destinations: [] }).error?.issues[0]?.message).toBe('Choisissez au moins une destination.');
  });

  it('modification : un nom non vide d’au plus 120 caractères, ou une adresse', () => {
    expect(StudyUpdate.parse({ name: '  Ma parcelle ' })).toEqual({ name: 'Ma parcelle' });
    expect(StudyUpdate.parse({ addressId: '94046_7120_00009' })).toEqual({ addressId: '94046_7120_00009' });
    const message = (v: unknown) => StudyUpdate.safeParse(v).error?.issues[0]?.message;
    expect(message({ name: '   ' })).toBe('Donnez un nom à l’étude.');
    expect(message({ name: 'x'.repeat(121) })).toBe('Au plus 120 caractères.');
    expect(message({ name: 3 })).toBe('Nom invalide.');
    expect(message({})).toBe('Rien à modifier.');
  });

  it('liste : recherche facultative, corbeille lue depuis la chaîne de requête', () => {
    expect(StudiesQuery.parse({})).toEqual({ trash: false });
    expect(StudiesQuery.parse({ q: ' dolet ', trash: 'true' })).toEqual({ q: 'dolet', trash: true });
    expect(StudiesQuery.safeParse({ q: 'x'.repeat(101) }).error?.issues[0]?.message).toBe('Recherche trop longue.');
  });
});
