// Textes de la CLI du marché (F-05) : une analyse en cours, en échec, aux sources muettes, hors DVF ;
// une liste de ventes de toutes sortes.
import { describe, expect, it } from 'vitest';

import type { MarketSale, StudyMarket } from '../contracts/index.ts';
import { describeMarket, describeSales } from './market.commands.ts';

const down = { status: 'unavailable' as const, error: 'HTTP 503' };
const base: StudyMarket = {
  status: 'running',
  radiusM: 1000,
  stale: true,
  newerData: true,
  requestedAt: '2026-10-02T10:00:00.000Z',
  computedAt: '2026-10-01T10:00:00.000Z',
  error: 'L’analyse de marché a échoué.',
  result: null,
  sources: [],
  progress: [{ key: 'dvf', label: 'Ventes DVF', state: 'running', detail: null, startedAt: '2026-10-02T10:00:00.000Z', finishedAt: null }],
};

describe('describeMarket', () => {
  it('en cours, périmée, données plus récentes, erreur, déroulé', () => {
    const text = describeMarket(base);
    expect(text).toMatch(/^Analyse de marché : en cours, rayon 1000 m, périmée \(parcelles ou rayon modifiés\), données plus récentes disponibles, calculée le /);
    expect(text).toContain('  erreur : L’analyse de marché a échoué.');
    expect(text).toContain('  Déroulé :\n  … Ventes DVF');
  });

  it('hors DVF, sources muettes ; puis sans prix ni ventes publiées', () => {
    const result = { version: 1 as const, center: [6.17, 49.11] as [number, number], radiusM: 500 as const, covered: false, dvf: down, newBuild: down, permits: down, indices: down };
    const text = describeMarket({ ...base, status: 'ready', stale: false, newerData: false, error: null, computedAt: null, result });
    expect(text.split('\n')).toEqual([
      'Analyse de marché : prête, rayon 1000 m',
      '  Centre 6.17, 49.11, rayon 500 m — non couvert par DVF',
      '  DVF : indisponible (HTTP 503)',
      '  Neuf (ECLN) : indisponible (HTTP 503)',
      '  Sitadel : indisponible (HTTP 503)',
      '  Indices : indisponible (HTTP 503)',
    ]);
    const empty = describeMarket({
      ...base,
      status: 'ready',
      progress: [],
      result: {
        ...result,
        covered: true,
        dvf: { status: 'ok', data: { departments: [], from: null, horizon: null, saleCount: 0, comparableCount: 0, indicators: [], history: { year: [], quarter: [] }, communes: [] } },
        newBuild: { status: 'ok', data: { department: '971', quarters: [{ quarter: '2026-T2', housingType: 'individual', pricePerM2: 4000, averagePrice: null, reservations: null, listed: null, stock: null, monthsToSell: null }] } },
        permits: { status: 'ok', data: { communeCode: '97101', communeName: null, asOf: '2026-10-02T10:00:00.000Z', rows: [{ year: 2025, housingType: 'all', authorizedUnits: null, startedUnits: null, authorizedArea: null, startedArea: null }] } },
        indices: { status: 'ok', data: [{ id: '1', label: 'ICC', kind: 'construction', propertyType: null, last: { period: '2026-Q2', value: 2103 }, yearChangePct: -0.5 }] },
      },
    });
    expect(empty).toContain('  DVF : 0 vente(s) comparable(s) sur 0, du — au — ; millésimes ');
    expect(empty.replace(/\u202f/g, ' ')).toContain('  Neuf (ECLN) : 2026-T2 individuel 4 000 €/m²');
    expect(empty).toContain('  Sitadel : 2025 0 autorisé(s)/0 commencé(s)');
    expect(empty).toContain('  Indices : ICC 2 103 (2026-Q2, -0,5 % sur un an)'.replace(' 103', '\u202f103'));
    const none = describeMarket({ ...base, status: 'ready', progress: [], result: { ...result, newBuild: { status: 'ok', data: { department: '971', quarters: [] } }, permits: { status: 'ok', data: { communeCode: '97101', communeName: null, asOf: '2026-10-02T10:00:00.000Z', rows: [] } } } });
    expect(none).toContain('  Neuf (ECLN) : aucun prix publié (971)');
    expect(none).toContain('  Sitadel : aucun');
  });
});

describe('describeSales', () => {
  const sale = (over: Partial<MarketSale>): MarketSale => ({
    id: '1',
    date: '2025-06-01',
    nature: 'Vente',
    vefa: false,
    price: 100_000,
    propertyType: 'land',
    category: null,
    pricePerM2: null,
    builtArea: null,
    landArea: null,
    rooms: null,
    dwellingCount: 0,
    address: null,
    postcode: null,
    communeCode: '94046',
    position: [2.43, 48.8],
    distanceM: 12,
    parcels: [],
    parcelIds: [],
    ...over,
  });

  it('terrain, sans surface, VEFA ; liste tronquée', () => {
    const text = describeSales(
      { center: [2.43, 48.8], radiusM: 500, truncated: true, sales: [sale({ landArea: 600 }), sale({}), sale({ vefa: true, propertyType: 'apartment', builtArea: 50, pricePerM2: 6000 })] },
      2,
    ).replace(/\u202f/g, ' ');
    expect(text.split('\n')).toEqual([
      '3+ vente(s) dans 500 m de 2.43, 48.8',
      '  2025-06-01    12 m  land           100 000 €  600 m² de terrain  (hors prix)  ',
      '  2025-06-01    12 m  land           100 000 €  —                  (hors prix)  ',
      '  … 1 autre(s) (--limit)',
    ]);
    expect(describeSales({ center: [2.43, 48.8], radiusM: 500, truncated: false, sales: [sale({ vefa: true })] }, 5)).toContain('[VEFA]');
  });
});
