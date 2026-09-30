import { describe, expect, it } from 'vitest';

import { departmentOf, isCommuneCode } from './commune.ts';
import { isParcelId, parcelLabel, parseParcelId } from './parcel-id.ts';

describe('IDU', () => {
  it('lit une parcelle de Maisons-Alfort, de Corse et d’outre-mer', () => {
    expect(parseParcelId('940460000A0018')).toEqual({ commune: '94046', prefix: '000', section: '0A', number: '0018' });
    expect(parseParcelId('2A004000AB0123')).toEqual({ commune: '2A004', prefix: '000', section: 'AB', number: '0123' });
    expect(parseParcelId('97101123ZC0005')?.prefix).toBe('123');
  });

  it('refuse ce qui n’est pas un IDU', () => {
    for (const id of ['', '94046_000_A_18', '940460000a0018', '940460000A018', '2C004000AB0123']) {
      expect(isParcelId(id)).toBe(false);
      expect(parseParcelId(id)).toBeNull();
    }
  });

  it('libellé : section et numéro sans zéros, préfixe s’il n’est pas 000', () => {
    expect(parcelLabel({ prefix: '000', section: '0A', number: '0018' })).toBe('A 18');
    expect(parcelLabel({ prefix: '000', section: 'AB', number: '0120' })).toBe('AB 120');
    expect(parcelLabel({ prefix: '012', section: 'ZC', number: '0005' })).toBe('012 ZC 5');
  });
});

describe('communes', () => {
  it('codes INSEE, Corse et outre-mer compris ; département', () => {
    expect(['94046', '2A004', '2B033', '97101', '75111'].every(isCommuneCode)).toBe(true);
    expect(['9404', '2C004', 'ab123', '940460'].some(isCommuneCode)).toBe(false);
    expect(departmentOf('94046')).toBe('94');
    expect(departmentOf('2A004')).toBe('2A');
    expect(departmentOf('97411')).toBe('974');
  });
});
