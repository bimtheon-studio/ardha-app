// L'analyseur des risques (F-04) sur des sources factices : toutes muettes, ou qui répondent juste
// assez pour vérifier les distances, les tris et les classes ouvertes.
import { describe, expect, it } from 'vitest';

import { FakeHttp } from '../../test/fake-http.ts';
import { RisksResult } from '../contracts/index.ts';
import { rect } from '../domain/geometry.test.ts';
import type { CommunesRepository } from '../geo/communes.repository.ts';
import { Elevation, ELEVATION_URL } from '../sources/elevation.ts';
import { FLOOD_WMS, FloodHeights } from '../sources/flood-heights.ts';
import { Georisques, GEORISQUES_BASE } from '../sources/georisques.ts';
import { Hydrants, OVERPASS_URL } from '../sources/hydrants.ts';
import type { StudyParcelRecord } from '../studies/studies.repository.ts';
import type { HydrantCache } from './hydrant-cache.ts';
import { frenchDateKey, RiskAnalyzer } from './risk-analyzer.ts';

const parcel = (n: number, communeCode = '94046'): StudyParcelRecord => ({
  id: `${communeCode}000AB${String(n).padStart(4, '0')}`,
  position: n,
  communeCode,
  prefix: '000',
  section: 'AB',
  number: String(n).padStart(4, '0'),
  contenance: 100,
  area: 100,
  geometry: rect(2.43 + n * 0.001, 48.8, 2.4305 + n * 0.001, 48.8005),
  version: '2026-09-01',
});

function analyzer(http: FakeHttp, names: Record<string, string> = { '94046': 'Maisons-Alfort' }) {
  const communes = { byCode: async (code: string) => (names[code] ? { name: names[code] } : undefined) } as unknown as CommunesRepository;
  // Le cache des bornes est éprouvé à part (test/risks.test.ts) : ici, Overpass directement.
  const hydrants = { inBbox: async (b: readonly [number, number, number, number]) => ({ items: await new Hydrants(http).inBbox(b), asOf: new Date('2026-10-02T00:00:00Z') }) } as unknown as HydrantCache;
  return new RiskAnalyzer(new Georisques(http), new FloodHeights(http), new Elevation(http), hydrants, communes);
}

describe('RiskAnalyzer', () => {
  it('toutes les sources muettes : chaque donnée est « indisponible », le résultat reste valide', async () => {
    const r = await analyzer(new FakeHttp()).analyze([parcel(0), parcel(1, '94080')]);
    expect(RisksResult.parse(r)).toEqual(r);
    expect(r.communes.map((c) => [c.code, c.name, c.radon.status, c.plans.status, c.catnat.status])).toEqual([
      ['94046', 'Maisons-Alfort', 'unavailable', 'unavailable', 'unavailable'],
      ['94080', null, 'unavailable', 'unavailable', 'unavailable'],
    ]);
    expect(r.parcels.map((p) => [p.clay.status, p.flood.status, p.elevation.status, p.floodLevel])).toEqual([
      ['unavailable', 'unavailable', 'unavailable', null],
      ['unavailable', 'unavailable', 'unavailable', null],
    ]);
    for (const k of ['cavities', 'installations', 'pollutedSites', 'hydrants'] as const) expect(r[k].status).toBe('unavailable');
  });

  it('sources qui répondent : distances à l’emprise, rayons, tris, CatNat récents d’abord, cote « au moins »', async () => {
    const empty = { json: { data: [], total_pages: 1 } };
    const gml = `<msGMLOutput><ISO_HT_01_02MOY_feature><ht_min>2</ht_min><ht_max>10</ht_max></ISO_HT_01_02MOY_feature></msGMLOutput>`;
    const http = new FakeHttp({
      [`${GEORISQUES_BASE}/radon`]: { json: { data: [{ classe_potentiel: '3' }] } },
      [`${GEORISQUES_BASE}/zonage_sismique`]: { json: { data: [{ code_zone: '2' }] } },
      [`${GEORISQUES_BASE}/gaspar/risques`]: { json: { data: [{ risques_detail: [{ num_risque: '11', libelle_risque_long: 'Inondation' }] }] } },
      [`${GEORISQUES_BASE}/gaspar/pprn`]: { json: { content: [{ idGaspar: 'P1', libPpr: 'PPRI X', modeleProcedure: 'PPRN-I' }] } },
      [`${GEORISQUES_BASE}/gaspar/pprt`]: { json: { content: [] } },
      [`${GEORISQUES_BASE}/gaspar/catnat`]: {
        json: {
          data: [
            { code_national_catnat: 'A', libelle_risque_jo: 'Inondations', date_debut_evt: '23/07/1988' },
            { code_national_catnat: 'B', libelle_risque_jo: 'Sécheresse', date_debut_evt: '01/06/2022' },
            { code_national_catnat: 'C', libelle_risque_jo: 'Tempête', date_debut_evt: null },
          ],
        },
      },
      [`${GEORISQUES_BASE}/installations_classees`]: {
        json: {
          data: [
            { raisonSociale: 'Loin', longitude: 2.6, latitude: 48.8 },
            { raisonSociale: 'Sans position', longitude: null, latitude: null },
            { raisonSociale: 'Proche', regime: 'Enregistrement', statutSeveso: 'Seveso seuil bas', longitude: 2.4302, latitude: 48.8008, codeAIOT: '1' },
          ],
        },
      },
      [`${GEORISQUES_BASE}/ssp/conclusions_sis`]: { json: { data: [{ identifiant_ssp: 'S1', nom: 'SIS proche', geom: rect(2.4301, 48.8006, 2.4302, 48.8007) }, { identifiant_ssp: 'S2', nom: 'Sans géométrie' }] } },
      [`${GEORISQUES_BASE}/ssp/casias`]: empty,
      [`${GEORISQUES_BASE}/cavites`]: { json: { data: [{ identifiant: 'C1', nom: 'Proche', type: 'naturelle', longitude: 2.4303, latitude: 48.8002 }, { identifiant: 'C2', nom: 'Loin', type: 'naturelle', longitude: 2.5, latitude: 48.8 }] } },
      [`${GEORISQUES_BASE}/rga`]: { json: { codeExposition: '2' } },
      [FLOOD_WMS]: { text: gml },
      [ELEVATION_URL]: { json: { elevations: Array.from({ length: 40 }, () => ({ lon: 2.43, lat: 48.8, z: 30 })) } },
      [OVERPASS_URL]: {
        json: {
          elements: [
            { type: 'node', id: 2, lat: 48.8035, lon: 2.4302, tags: {} },
            { type: 'node', id: 1, lat: 48.8007, lon: 2.4302, tags: {} },
            { type: 'node', id: 3, lat: 48.9, lon: 2.43, tags: {} },
          ],
        },
      },
    });
    const r = RisksResult.parse(await analyzer(http).analyze([parcel(0)]));
    const [c] = r.communes;
    expect(c).toMatchObject({ radon: { status: 'ok', data: 3 }, seismic: { status: 'ok', data: 2 } });
    expect(c!.plans).toMatchObject({ status: 'ok', data: [{ id: 'P1', flood: true, zones: [], modifiedAt: null }] });
    expect(c!.catnat.status === 'ok' && c!.catnat.data.latest.map((e) => e.id)).toEqual(['B', 'A', 'C']);
    const [p] = r.parcels;
    expect(p).toMatchObject({ clay: { status: 'ok', data: 'moyen' }, flood: { status: 'ok', data: { hazard: 'moyen', reference: { height: 2, atLeast: true } } } });
    expect(p!.elevation).toMatchObject({ status: 'ok', data: { mean: 30 } });
    expect(p!.floodLevel).toEqual({ level: 32, atLeast: true });
    expect(r.cavities.status === 'ok' && r.cavities.data.items.map((i) => i.id)).toEqual(['C1']);
    expect(r.installations.status === 'ok' && r.installations.data).toMatchObject({ count: 3, items: [{ name: 'Proche', seveso: 'Seveso seuil bas' }] });
    expect(r.pollutedSites.status === 'ok' && r.pollutedSites.data).toMatchObject({ count: 2, items: [{ id: 'S1', kind: 'SIS', distanceM: expect.any(Number) }] });
    // À moins de 400 m, la plus proche d'abord ; celle à ~11 km est écartée.
    expect(r.hydrants.status === 'ok' && r.hydrants.data.items.map((h) => h.id)).toEqual(['node/1', 'node/2']);
  });

  it('une altitude manquante ne fausse pas la moyenne ; sans altitude, pas de cote', async () => {
    const http = new FakeHttp({ [ELEVATION_URL]: { json: { elevations: Array.from({ length: 40 }, () => ({ lon: 2.43, lat: 48.8, z: -99999 })) } } });
    const [p] = (await analyzer(http).analyze([parcel(0)])).parcels;
    expect(p!.elevation).toEqual({ status: 'ok', data: null });
    expect(p!.floodLevel).toBeNull();
  });
});

describe('frenchDateKey', () => {
  it('trie les dates « JJ/MM/AAAA »', () => {
    expect(frenchDateKey('23/07/1988')).toBe('1988-07-23');
    expect(frenchDateKey(null)).toBe('');
    expect(frenchDateKey('1988')).toBe('');
  });
});
