import { describe, expect, it } from 'vitest';

import {
  circleProbes,
  dvfCheckDue,
  filterIqr,
  INDEX_SERIES,
  indexSeriesFor,
  indexSummary,
  isMarketRadius,
  marketCenter,
  marketKey,
  newBuildPremiumPct,
  nextDvfPublication,
  periodOf,
  periodYearBefore,
  type PricedSale,
  priceColor,
  priceHistory,
  priceIndicators,
  priceScale,
  quantile,
  shiftMonths,
  summarizePrices,
} from './market.ts';
import { pointDistanceM } from './geometry.ts';

const sale = (date: string, pricePerM2: number, over: Partial<PricedSale> = {}): PricedSale => ({
  date,
  pricePerM2,
  category: 'apartment',
  segment: 'existing',
  ...over,
});

describe('statistiques', () => {
  it('quantile par interpolation linéaire', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.75)).toBe(10);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });

  it('IQR : rien sous 4 valeurs, l’extrême écarté au-delà', () => {
    expect(filterIqr([3, 1, 100])).toEqual([1, 3, 100]);
    expect(filterIqr([3000, 3100, 3200, 3300, 3400, 20_000])).toEqual([3000, 3100, 3200, 3300, 3400]);
  });

  it('résumé : médiane, P25, P75, effectif retenu ; rien sans valeur', () => {
    expect(summarizePrices([4000, 2000, 3000])).toEqual({ count: 3, median: 3000, p25: 2500, p75: 3500 });
    expect(summarizePrices([])).toBeNull();
  });

  it('décale une date de N mois, fin de mois tronquée', () => {
    expect(shiftMonths('2025-12-31', -12)).toBe('2024-12-31');
    expect(shiftMonths('2025-03-31', -1)).toBe('2025-02-28');
    expect(shiftMonths('2025-01-15', -1)).toBe('2024-12-15');
    expect(shiftMonths('2024-11-30', 3)).toBe('2025-02-28');
  });

  it('écart du neuf sur l’ancien', () => {
    expect(newBuildPremiumPct(6000, 5000)).toBe(20);
    expect(newBuildPremiumPct(null, 5000)).toBeNull();
    expect(newBuildPremiumPct(6000, 0)).toBeNull();
  });

  it('empreinte de l’analyse : parcelles et rayon', () => {
    expect(marketKey('abc', 500)).toBe('abc@500');
  });

  it('rayons proposés', () => {
    expect([250, 500, 1000, 2000].every(isMarketRadius)).toBe(true);
    expect(isMarketRadius(700)).toBe(false);
  });
});

describe('priceIndicators', () => {
  it('médiane des 12 derniers mois, tendance contre les 12 précédents', () => {
    const sales = [
      ...[5000, 5100, 5200, 5300, 5400].map((p, i) => sale(`2025-0${i + 1}-10`, p)),
      ...[4800, 4900, 5000, 5100, 5000].map((p, i) => sale(`2024-0${i + 2}-10`, p)),
      sale('2023-06-01', 9999),
    ];
    const apartment = priceIndicators(sales, '2025-12-31').find((i) => i.category === 'apartment' && i.segment === 'existing')!;
    expect(apartment.current).toEqual({ count: 5, median: 5200, p25: 5100, p75: 5300 });
    expect(apartment.previous!.median).toBe(5000);
    expect(apartment.trendPct).toBe(4);
    expect(apartment.lowSample).toBe(true);
  });

  it('sans tendance sous 5 ventes par période ; six indicateurs, vides sans ventes', () => {
    const out = priceIndicators([sale('2025-06-01', 5000), sale('2024-06-01', 4000)], '2025-12-31');
    expect(out).toHaveLength(6);
    expect(out[2]).toMatchObject({ category: 'apartment', segment: 'existing', trendPct: null });
    expect(out[0]).toEqual({ category: 'house', segment: 'existing', current: null, previous: null, trendPct: null, lowSample: true });
  });

  it('assez de ventes : pas d’avertissement', () => {
    const many = Array.from({ length: 20 }, (_, i) => sale(`2025-${String((i % 12) + 1).padStart(2, '0')}-01`, 5000 + i));
    expect(priceIndicators(many, '2025-12-31')[2]!.lowSample).toBe(false);
  });
});

describe('priceHistory', () => {
  it('par année et par trimestre, périodes de moins de 3 ventes écartées, triées', () => {
    const sales = [
      sale('2024-01-10', 4000),
      sale('2024-02-10', 4200),
      sale('2024-03-10', 4400),
      sale('2024-08-10', 4600),
      sale('2023-05-10', 3000, { category: 'house' }),
      sale('2023-05-11', 3100, { category: 'house' }),
      sale('2023-05-12', 3200, { category: 'house' }),
      sale('2023-05-13', 3300, { category: 'house', segment: 'new' }),
      sale('2023-05-14', 3400, { category: 'house', segment: 'new' }),
      sale('2023-05-15', 3500, { category: 'house', segment: 'new' }),
    ];
    expect(priceHistory(sales, 'year')).toEqual([
      { period: '2023', category: 'house', segment: 'existing', count: 3, median: 3100 },
      { period: '2023', category: 'house', segment: 'new', count: 3, median: 3400 },
      { period: '2024', category: 'apartment', segment: 'existing', count: 4, median: 4300 },
    ]);
    expect(priceHistory(sales, 'quarter').map((p) => p.period)).toEqual(['2023-T2', '2023-T2', '2024-T1']);
    expect(periodOf('2024-12-31', 'quarter')).toBe('2024-T4');
  });

  it('même période, deux types : appartement avant maison', () => {
    const sales = [1, 2, 3].flatMap((d) => [sale(`2024-01-0${d}`, 3000, { category: 'house' }), sale(`2024-01-0${d}`, 5000)]);
    expect(priceHistory(sales, 'year').map((p) => p.category)).toEqual(['apartment', 'house']);
  });
});

describe('marketCenter', () => {
  it('centre de la boîte de toutes les parcelles', () => {
    const square = (x: number, y: number) => ({ type: 'Polygon' as const, coordinates: [[[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y]]] });
    expect(marketCenter([square(2.43, 48.8), square(2.44, 48.81)])).toEqual([2.4355, 48.8055]);
  });
});

describe('circleProbes', () => {
  it('le centre et 8 points à la distance du rayon', () => {
    const probes = circleProbes([2.43, 48.81], 1000);
    expect(probes).toHaveLength(9);
    expect(probes[0]).toEqual([2.43, 48.81]);
    for (const p of probes.slice(1)) expect(Math.abs(pointDistanceM([2.43, 48.81], p) - 1000)).toBeLessThan(10);
  });
});

describe('calendrier DVF', () => {
  it('prochaine publication : 1er avril, 1er octobre, puis l’année suivante', () => {
    expect(nextDvfPublication(new Date('2026-02-01T00:00:00Z')).toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(nextDvfPublication(new Date('2026-04-01T00:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(nextDvfPublication(new Date('2026-10-02T00:00:00Z')).toISOString()).toBe('2027-04-01T00:00:00.000Z');
  });

  it('à relire dès qu’une publication est passée', () => {
    expect(dvfCheckDue(new Date('2026-05-18T00:00:00Z'), new Date('2026-09-30T00:00:00Z'))).toBe(false);
    expect(dvfCheckDue(new Date('2026-05-18T00:00:00Z'), new Date('2026-10-01T00:00:00Z'))).toBe(true);
  });
});

describe('indices', () => {
  it('construction, zone et national selon le département', () => {
    expect(indexSeriesFor('94').map((s) => s.id)).toEqual(['000008630', '001710986', '010567045', '010567049', '010567057', '010567061']);
    expect(indexSeriesFor('75').map((s) => s.id)).toEqual(['000008630', '001710986', '010567013', '010567057', '010567061']);
    expect(indexSeriesFor('37').slice(2, 4).map((s) => s.label)).toEqual(['Prix des appartements anciens, province', 'Prix des maisons anciennes, province']);
    expect(indexSeriesFor('974').map((s) => s.id)).toEqual(['000008630', '001710986', '010567117', '010567121']);
  });

  it('catalogue sans doublon', () => {
    expect(new Set(INDEX_SERIES.map((s) => s.id)).size).toBe(INDEX_SERIES.length);
  });

  it('dernière valeur et évolution sur un an, trimestre ou mois', () => {
    expect(periodYearBefore('2026-Q2')).toBe('2025-Q2');
    expect(periodYearBefore('2026-07')).toBe('2025-07');
    expect(indexSummary([{ period: '2026-Q2', value: 2103 }, { period: '2025-Q2', value: 2050 }, { period: '2026-Q1', value: 2090 }])).toEqual({
      last: { period: '2026-Q2', value: 2103 },
      yearChangePct: 2.6,
    });
    expect(indexSummary([{ period: '2026-07', value: 138.9 }])).toEqual({ last: { period: '2026-07', value: 138.9 }, yearChangePct: null });
    expect(indexSummary([])).toBeNull();
  });
});

describe('échelle de prix', () => {
  it('bornes P10–P90, prix nuls ignorés ; rien sans prix', () => {
    const prices = Array.from({ length: 10 }, (_, i) => (i + 1) * 1000);
    expect(priceScale([0, ...prices])).toEqual({ lo: 2000, hi: 10_000, count: 10 });
    expect(priceScale([5000])).toEqual({ lo: 5000, hi: 5001, count: 1 });
    expect(priceScale([])).toBeNull();
  });

  it('couleur : bleu en bas, rouge en haut, interpolée entre deux paliers, bornée', () => {
    const scale = { lo: 1000, hi: 5000, count: 2 };
    expect(priceColor(1000, scale)).toBe('rgb(37,99,235)');
    expect(priceColor(500, scale)).toBe('rgb(37,99,235)');
    expect(priceColor(5000, scale)).toBe('rgb(239,68,68)');
    expect(priceColor(9000, scale)).toBe('rgb(239,68,68)');
    expect(priceColor(3000, scale)).toBe('rgb(74,222,128)');
    expect(priceColor(1500, scale)).toBe('rgb(36,155,237)');
  });
});
