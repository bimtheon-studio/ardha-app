import { describe, expect, it } from 'vitest';

import { rect } from './geometry.test.ts';
import { addRefusal, formatArea, pieces, REFUSAL_MESSAGES, SELECTION_MAX, type SelectableParcel, summarize, toggle, touches } from './selection.ts';

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

  it('la 1ʳᵉ parcelle est libre ; les suivantes doivent toucher la sélection', () => {
    expect(addRefusal([], parcel(5))).toBeNull();
    expect(addRefusal([parcel(0)], parcel(1))).toBeNull();
    expect(addRefusal([parcel(0)], parcel(3))).toBe('not-contiguous');
    expect(addRefusal([parcel(0), parcel(2)], parcel(3))).toBeNull();
  });

  it('plafond de 50 parcelles', () => {
    const full = Array.from({ length: SELECTION_MAX }, (_, i) => parcel(i));
    expect(addRefusal(full, parcel(SELECTION_MAX))).toBe('limit-reached');
    expect(REFUSAL_MESSAGES['limit-reached']).toContain('50');
  });
});

describe('toggle', () => {
  it('ajoute, refuse, retire (même au milieu, ce qui coupe la sélection en morceaux)', () => {
    const a = toggle([], parcel(0));
    expect(a).toMatchObject({ action: 'added' });
    const b = toggle(a.selection, parcel(1));
    const c = toggle(b.selection, parcel(2));
    expect(c.selection.map((p) => p.id)).toEqual(['p0-0', 'p0-1', 'p0-2']);
    expect(toggle(c.selection, parcel(9))).toMatchObject({ action: 'refused', refusal: 'not-contiguous' });
    const d = toggle(c.selection, parcel(1));
    expect(d).toMatchObject({ action: 'removed' });
    expect(pieces(d.selection)).toBe(2);
  });
});

describe('summarize', () => {
  it('compte, somme les contenances connues et les surfaces, dit le nombre de morceaux', () => {
    const s = summarize([parcel(0), parcel(1, 0, null), parcel(2, 0, 120)]);
    expect(s).toMatchObject({ count: 3, contenance: 200, withoutContenance: 1, pieces: 1 });
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
