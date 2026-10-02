import { describe, expect, it } from 'vitest';

import type { RisksResult } from '../contracts/index.ts';
import { axesInput } from './risks.service.ts';

const ok = <T>(data: T) => ({ status: 'ok' as const, data });
const off = { status: 'unavailable' as const, error: 'HTTP 503' };

function result(over: { communes?: Partial<RisksResult['communes'][number]>[]; parcels?: Partial<RisksResult['parcels'][number]>[] }): RisksResult {
  const commune = { code: '94046', name: 'M', radon: ok(1), seismic: ok(1), hazards: ok([]), plans: ok([]), catnat: ok({ count: 0, truncated: false, latest: [] }) };
  const parcel = { id: 'p', label: 'AB 1', point: [0, 0] as [number, number], clay: ok(null), flood: ok({ hazard: null, scenarios: [], reference: null }), elevation: ok(null), floodLevel: null };
  const empty = ok({ count: 0, truncated: false, items: [] });
  return {
    version: 2,
    center: [0, 0],
    radii: { nearbyM: 500, hydrantsM: 400 },
    communes: (over.communes ?? [{}]).map((c) => ({ ...commune, ...c })) as RisksResult['communes'],
    parcels: (over.parcels ?? [{}]).map((p) => ({ ...parcel, ...p })) as RisksResult['parcels'],
    cavities: ok({ truncated: false, items: [] }),
    installations: empty,
    pollutedSites: empty,
    hydrants: ok({ asOf: '2026-10-02T00:00:00.000Z', items: [] }),
  };
}

describe('axesInput', () => {
  it('pire valeur des communes et des parcelles', () => {
    const plan = { id: 'P', kind: 'PPRN' as const, label: 'PPRI', model: 'PPRN-I', modifiedAt: null, flood: true, zones: [], url: 'u', state: null, approvedAt: null, prescribedAt: null, hazards: [], prefectureUrl: null };
    expect(
      axesInput(
        result({
          communes: [{ radon: ok(2), seismic: ok(3) }, { radon: ok(1), seismic: ok(null), plans: ok([plan]) }],
          parcels: [{ clay: ok('faible') }, { clay: ok('fort'), flood: ok({ hazard: 'moyen', scenarios: [], reference: null }) }],
        }),
      ),
    ).toEqual({ floodHazard: 'moyen', floodPlan: true, clay: 'fort', radon: 2, seismic: 3 });
  });

  it('une source muette rend l’axe indisponible, sauf si le pire est déjà connu', () => {
    expect(axesInput(result({ communes: [{ radon: off }, { radon: ok(1) }], parcels: [{ clay: off }, { clay: ok('moyen') }] }))).toMatchObject({ radon: 'unavailable', clay: 'unavailable' });
    expect(axesInput(result({ communes: [{ radon: off }, { radon: ok(3), seismic: ok(5) }, { seismic: off }], parcels: [{ clay: off }, { clay: ok('fort') }] }))).toMatchObject({
      radon: 3,
      seismic: 5,
      clay: 'fort',
    });
    expect(axesInput(result({ communes: [{ plans: off }], parcels: [{ flood: off }] }))).toMatchObject({ floodHazard: 'unavailable', floodPlan: 'unavailable' });
  });
});
