import { describe, expect, it } from 'vitest';

import { CNIG_SUB_DESTINATIONS, cnigLabel, cnigParent, decodeCnigDestinations, formatCnigDestination } from './cnig.ts';

// Repris de l'ancien `supabase/functions/_shared/__tests__/cnig-destinations.test.ts` @2a7f9a0.

describe('nomenclature CNIG', () => {
  it('familles correctes (10 = exploitation agricole, pas habitation)', () => {
    expect(cnigLabel('10')).toBe('Exploitation agricole et forestière');
    expect(cnigLabel('20')).toBe('Habitation');
    expect(cnigLabel('30')).toBe('Commerce et activités de service');
    expect(cnigLabel('40')).toBe('Équipements d’intérêt collectif et services publics');
    expect(cnigLabel('50')).toBe('Autres activités des secteurs secondaire ou tertiaire');
  });

  it('codes d’une zone N réelle (Créteil, île de loisirs)', () => {
    expect(cnigLabel('42')).toBe('Locaux techniques et industriels des administrations publiques et assimilés');
    expect(cnigLabel('45')).toBe('Équipements sportifs');
    expect(cnigLabel('44')).toBe('Salles d’art et de spectacles');
    expect(cnigLabel('46')).toBe('Autres équipements recevant du public');
    expect(cnigLabel('21')).toBe('Logement');
  });

  it('ajouts de l’arrêté du 22 mars 2023', () => {
    expect(cnigLabel('47')).toBe('Lieux de culte');
    expect(cnigLabel('55')).toBe('Cuisine dédiée à la vente en ligne');
  });

  it('code inconnu : pas de libellé, jamais de repli inventé', () => {
    expect(cnigLabel('99')).toBeNull();
    expect(cnigLabel('00')).toBeNull();
    expect(formatCnigDestination({ code: '99', label: null })).toBe('99 — libellé inconnu');
    expect(formatCnigDestination({ code: '21', label: 'Logement' })).toBe('21 — Logement');
  });

  it('découpe « 10-22-30 », retire les doublons, garde l’ordre', () => {
    expect(decodeCnigDestinations('10-22-30')).toEqual([
      { code: '10', label: 'Exploitation agricole et forestière' },
      { code: '22', label: 'Hébergement' },
      { code: '30', label: 'Commerce et activités de service' },
    ]);
    expect(decodeCnigDestinations(null)).toEqual([]);
    expect(decodeCnigDestinations('')).toEqual([]);
    expect(decodeCnigDestinations('45-45')).toEqual([{ code: '45', label: 'Équipements sportifs' }]);
    expect(decodeCnigDestinations(' 21, 53 ')).toEqual([
      { code: '21', label: 'Logement' },
      { code: '53', label: 'Bureau' },
    ]);
  });

  it('23 sous-destinations, chacune rattachée à sa destination', () => {
    expect(CNIG_SUB_DESTINATIONS).toHaveLength(23);
    expect(CNIG_SUB_DESTINATIONS.every((c) => !c.endsWith('0'))).toBe(true);
    expect(cnigParent('53')).toBe('50');
    expect(cnigParent('21')).toBe('20');
    expect(cnigParent('20')).toBeNull();
    expect(cnigParent('99')).toBeNull();
  });
});
