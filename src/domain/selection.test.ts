import { describe, expect, it } from 'vitest';

import { rect } from './geometry.test.ts';
import { addRefusal, formatArea, pieces, REFUSAL_MESSAGES, removeRefusal, SELECTION_MAX, type SelectableParcel, summarize, toggle, touches } from './selection.ts';

/** Parcelle carrée n° i d'une rangée d'est en ouest, de 0,0001° de côté (≈ 7 × 11 m). */
function parcel(i: number, row = 0, contenance: number | null = 80): SelectableParcel {
  const w = 2.44 + i * 0.0001;
  const s = 48.8 + row * 0.0001;
  return { id: `p${row}-${i}`, geometry: rect(w, s, w + 0.0001, s + 0.0001), contenance };
}

describe('contiguïté', () => {
  it('se touchent : bord commun, coin commun, écart de moins d’un mètre', () => {
    expect(touches(parcel(0), parcel(1))).toBe(true);
    expect(touches(parcel(0), parcel(1, 1))).toBe(true);
    const near = { ...parcel(1), geometry: rect(2.440108, 48.8, 2.4402, 48.8001) }; // ≈ 0,6 m
    expect(touches(parcel(0), near)).toBe(true);
    const far = { ...parcel(1), geometry: rect(2.44012, 48.8, 2.4402, 48.8001) }; // ≈ 1,5 m
    expect(touches(parcel(0), far)).toBe(false);
  });

  it('d’un seul tenant (Q4, revu le 13/10/2026) : une parcelle qui ne touche pas la sélection est refusée', () => {
    expect(addRefusal([], parcel(3))).toBeNull();
    expect(addRefusal([parcel(0)], parcel(1))).toBeNull();
    expect(addRefusal([parcel(0)], parcel(3))).toBe('not-touching');
    // Il suffit de toucher une des parcelles de la sélection.
    expect(addRefusal([parcel(0), parcel(1), parcel(2)], parcel(3))).toBeNull();
    expect(toggle([parcel(0)], parcel(3))).toMatchObject({ action: 'refused', refusal: 'not-touching', selection: [parcel(0)] });
    expect(REFUSAL_MESSAGES['not-touching']).toBe('Cette parcelle ne touche pas la sélection : une sélection est d’un seul tenant.');
  });

  it('un retrait qui couperait la sélection est refusé ; les bords se retirent', () => {
    const row = [parcel(0), parcel(1), parcel(2)];
    expect(removeRefusal(row, 'p0-1')).toBe('would-split');
    expect(removeRefusal(row, 'p0-0')).toBeNull();
    expect(removeRefusal(row, 'p0-2')).toBeNull();
    expect(removeRefusal([parcel(0)], 'p0-0')).toBeNull();
    // Une sélection déjà en morceaux (lien partagé) se défait sans ajouter de morceau.
    const split = [parcel(0), parcel(5), parcel(6), parcel(7)];
    expect(removeRefusal(split, 'p0-0')).toBeNull();
    expect(removeRefusal(split, 'p0-6')).toBe('would-split');
    expect(REFUSAL_MESSAGES['would-split']).toBe('Retirer cette parcelle couperait la sélection en deux : retirez d’abord celles d’un côté.');
  });

  it('plafond de 50 parcelles', () => {
    const full = Array.from({ length: SELECTION_MAX }, (_, i) => parcel(i));
    expect(addRefusal(full, parcel(SELECTION_MAX))).toBe('limit-reached');
    expect(toggle(full, parcel(SELECTION_MAX))).toMatchObject({ action: 'refused', refusal: 'limit-reached' });
    expect(REFUSAL_MESSAGES['limit-reached']).toContain('50');
  });
});

describe('toggle', () => {
  it('ajoute, retire par un bord ; refuse de couper la sélection en deux', () => {
    const a = toggle([], parcel(0));
    expect(a).toMatchObject({ action: 'added' });
    const b = toggle(a.selection, parcel(1));
    const c = toggle(b.selection, parcel(2));
    expect(c.selection.map((p) => p.id)).toEqual(['p0-0', 'p0-1', 'p0-2']);
    expect(toggle(c.selection, parcel(1))).toMatchObject({ action: 'refused', refusal: 'would-split' });
    const d = toggle(c.selection, parcel(0));
    expect(d).toMatchObject({ action: 'removed' });
    expect(d.selection.map((p) => p.id)).toEqual(['p0-1', 'p0-2']);
  });
});

describe('summarize', () => {
  it('compte, somme les contenances connues et les surfaces, dit le nombre de morceaux', () => {
    const s = summarize([parcel(0), parcel(1, 0, null), parcel(2, 0, 120)]);
    expect(s).toMatchObject({ count: 3, contenance: 200, withoutContenance: 1, pieces: 1 });
    expect(pieces([parcel(0), parcel(3)])).toBe(2);
    expect(s.area).toBeGreaterThan(3 * 80);
    expect(s.area).toBeLessThan(3 * 85);
    expect(summarize([])).toEqual({ count: 0, contenance: 0, withoutContenance: 0, area: 0, pieces: 0 });
  });

  it('formatArea : m² jusqu’à 1 ha, puis ha à deux décimales, à la française', () => {
    expect(formatArea(849.6)).toBe('850 m²');
    expect(formatArea(9999.4)).toBe('9 999 m²');
    expect(formatArea(12_500)).toBe('1,25 ha');
    expect(formatArea(1_234_567)).toBe('123,46 ha');
  });
});
