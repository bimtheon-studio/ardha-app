// Sources des risques (F-04) : sur les réponses réelles enregistrées (Maisons-Alfort, Annecy,
// Tours, Beaumont-Village) et sur des pannes fabriquées.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FakeHttp } from '../../test/fake-http.ts';
import { REPO_ROOT } from '../config/config.ts';
import { Elevation, ELEVATION_URL } from './elevation.ts';
import { FLOOD_WMS, FloodHeights, parseFloodGml } from './flood-heights.ts';
import { Georisques, GEORISQUES_BASE } from './georisques.ts';
import { RecordedHttp } from './http.ts';
import { Hydrants, OVERPASS_URL } from './hydrants.ts';

const FIXTURES = path.join(REPO_ROOT, 'fixtures/http');
const recorded = new RecordedHttp(FIXTURES);
const g = new Georisques(recorded);

/** Une réponse GML réelle du WMS des TRI, enregistrée à Maisons-Alfort. */
function realFloodGml(): string {
  const dir = path.join(FIXTURES, 'mapsref.brgm.fr');
  const body = readdirSync(dir)
    .filter((f) => f.endsWith('.body'))
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .find((b) => b.includes('ISO_HT_01_02MOY_feature'));
  return body!;
}

describe('Géorisques, réponses enregistrées', () => {
  it('Maisons-Alfort : radon 1, sismicité 1, inondation et TMD, PPRI Marne et Seine avec ses zones', async () => {
    expect(await g.radon('94046')).toBe(1);
    expect(await g.seismic('94046')).toBe(1);
    expect((await g.hazards('94046')).map((h) => h.label)).toEqual(['Inondation', 'Transport de marchandises dangereuses']);
    const plans = await g.plans('94046');
    const ppri = plans.find((p) => p.label === 'PPRI Marne et Seine')!;
    expect(ppri).toMatchObject({ kind: 'PPRN', model: 'PPRN-I', modifiedAt: '27/02/2025' });
    expect(ppri.zones.map((z) => z.code)).toEqual(['ZVC', 'ZR']);
    expect(plans.every((p) => p.kind === 'PPRN')).toBe(true);
  });

  it('Maisons-Alfort : CatNat, installations classées, sols pollués (pages lues en entier)', async () => {
    const catnat = await g.catnat('94046');
    expect(catnat.items).toHaveLength(9);
    expect(catnat.truncated).toBe(false);
    expect(catnat.items[0]).toMatchObject({ libelle_risque_jo: 'Inondations et/ou Coulées de Boue', date_debut_evt: '23/07/1988' });
    const icpe = await g.installations('94046');
    expect(icpe.items).toHaveLength(37);
    expect(icpe.items[0]).toMatchObject({ raisonSociale: 'SEMGEMA', regime: 'Autres régimes', longitude: 2.441967 });
    const sites = await g.pollutedSites('94046');
    expect(sites.items.filter((s) => s.kind === 'SIS')).toHaveLength(1);
    expect(sites.items.find((s) => s.kind === 'SIS')).toMatchObject({ name: 'SAD', geometry: { type: 'MultiPolygon' } });
  });

  it('Annecy : sismicité 4, radon 2', async () => {
    expect(await g.seismic('74010')).toBe(4);
    expect(await g.radon('74010')).toBe(2);
  });
});

describe('Géorisques, cas limites', () => {
  const at = (replies: ConstructorParameters<typeof FakeHttp>[0]) => new Georisques(new FakeHttp(replies));

  it('argiles : code d’exposition, ou hors zone sur une réponse vide', async () => {
    expect(await at({ [`${GEORISQUES_BASE}/rga`]: { json: { codeExposition: '3', exposition: 'Exposition forte' } } }).clay(1, 2)).toBe('3');
    expect(await at({ [`${GEORISQUES_BASE}/rga`]: { text: '' } }).clay(1, 2)).toBeNull();
    expect(await at({ [`${GEORISQUES_BASE}/rga`]: { json: {} } }).clay(1, 2)).toBeNull();
    await expect(at({ [`${GEORISQUES_BASE}/rga`]: { text: 'oups' } }).clay(1, 2)).rejects.toThrow('Géorisques rga : réponse illisible');
    await expect(at({ [`${GEORISQUES_BASE}/rga`]: { status: 503 } }).clay(1, 2)).rejects.toThrow('Géorisques rga : HTTP 503');
  });

  it('pagination : jusqu’à 5 pages de 100, puis tronqué ; les pages se demandent elles-mêmes', async () => {
    const http = new FakeHttp({ [`${GEORISQUES_BASE}/gaspar/catnat`]: { json: { data: [{ code_national_catnat: 'X', libelle_risque_jo: 'Inondation' }], total_pages: 9 } } });
    const r = await new Georisques(http).catnat('94046');
    expect(r).toMatchObject({ truncated: true });
    expect(r.items).toHaveLength(5);
    expect(http.calls.map((u) => new URL(u).searchParams.get('page'))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('PPR par `codeInsee` (pas `code_insee`, ignoré par le service) ; erreurs explicites', async () => {
    const http = new FakeHttp({ [`${GEORISQUES_BASE}/gaspar/`]: { json: { content: [], totalPages: 0 } } });
    expect(await new Georisques(http).plans('94046')).toEqual([]);
    expect(http.calls[0]).toContain('codeInsee=94046');
    await expect(at({ [`${GEORISQUES_BASE}/gaspar/`]: { json: { oups: 1 } } }).plans('94046')).rejects.toThrow('Géorisques PPRN : réponse inattendue');
    await expect(at({ [`${GEORISQUES_BASE}/radon`]: { json: { oups: 1 } } }).radon('94046')).rejects.toThrow('Géorisques radon : réponse inattendue');
    await expect(at({ [`${GEORISQUES_BASE}/radon`]: { text: '<html>' } }).radon('94046')).rejects.toThrow('Géorisques radon : réponse illisible');
    await expect(at({}).seismic('94046')).rejects.toThrow('Géorisques zonage_sismique : HTTP 404');
    // Commune sans donnée, entrée illisible écartée.
    expect(await at({ [`${GEORISQUES_BASE}/radon`]: { json: { data: [{ autre: 1 }] } } }).radon('94046')).toBeNull();
  });

  it('cavités autour d’un point, longitude d’abord', async () => {
    const http = new FakeHttp({ [`${GEORISQUES_BASE}/cavites`]: { json: { data: [{ identifiant: 'C1', nom: null, type: 'naturelle', longitude: 0.68, latitude: 47.4 }] } } });
    const r = await new Georisques(http).cavities(0.6889, 47.3941, 1000);
    expect(r.items).toEqual([{ identifiant: 'C1', nom: null, type: 'naturelle', longitude: 0.68, latitude: 47.4 }]);
    expect(new URL(http.calls[0]!).searchParams.get('latlon')).toBe('0.688900,47.394100');
  });
});

describe('hauteurs d’eau TRI', () => {
  it('lit le GML réel : scénarios et classes', () => {
    const hits = parseFloodGml(realFloodGml());
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.scenario === '02MOY' && h.type === '01' && h.heightMin === 2 && h.heightMax === 10)).toBe(true);
  });

  it('repris de l’ancien test (Île Saint-Louis) : une entrée par entité ; vide hors zone', () => {
    const xml = `<msGMLOutput><ISO_HT_01_01FOR_layer><ISO_HT_01_01FOR_feature><ht_min>2</ht_min><ht_max>3</ht_max></ISO_HT_01_01FOR_feature></ISO_HT_01_01FOR_layer>
      <ISO_HT_01_02MOY_layer><ISO_HT_01_02MOY_feature><ht_min>0</ht_min><ht_max>1</ht_max></ISO_HT_01_02MOY_feature><ISO_HT_01_02MOY_feature><ht_min>x</ht_min><ht_max>4</ht_max></ISO_HT_01_02MOY_feature></ISO_HT_01_02MOY_layer></msGMLOutput>`;
    expect(parseFloodGml(xml)).toEqual([
      { type: '01', scenario: '01FOR', heightMin: 2, heightMax: 3 },
      { type: '01', scenario: '02MOY', heightMin: 0, heightMax: 1 },
      { type: '01', scenario: '02MOY', heightMin: 0, heightMax: 4 },
    ]);
    expect(parseFloodGml('<msGMLOutput></msGMLOutput>')).toEqual([]);
  });

  it('interroge toutes les couches en un point ; une erreur n’est jamais « hors zone »', async () => {
    const http = new FakeHttp({ [FLOOD_WMS]: { text: '<msGMLOutput></msGMLOutput>' } });
    expect(await new FloodHeights(http).at(2.43, 48.8)).toEqual([]);
    const url = new URL(http.calls[0]!);
    expect(url.searchParams.get('QUERY_LAYERS')?.split(',')).toHaveLength(10);
    expect(url.searchParams.get('BBOX')).toBe('2.429900,48.799900,2.430100,48.800100');
    await expect(new FloodHeights(new FakeHttp({ [FLOOD_WMS]: { status: 500 } })).at(1, 2)).rejects.toThrow('HTTP 500');
    await expect(new FloodHeights(new FakeHttp({ [FLOOD_WMS]: { text: '<ServiceExceptionReport/>' } })).at(1, 2)).rejects.toThrow('réponse inattendue');
  });
});

describe('altimétrie IGN', () => {
  it('par lots de 100 points ; « pas de donnée » sous -99 ; arrondi au centimètre', async () => {
    const http = new FakeHttp({ [ELEVATION_URL]: { json: { elevations: [{ lon: 1, lat: 2, z: 32.3456 }, { lon: 1, lat: 2, z: -99999 }] } } });
    const points = Array.from({ length: 150 }, (_, i) => [1 + i * 1e-5, 2] as const);
    const r = await new Elevation(http).points(points);
    expect(http.calls).toHaveLength(2);
    expect(r.slice(0, 2)).toEqual([
      { lon: 1, lat: 2, z: 32.35 },
      { lon: 1, lat: 2, z: null },
    ]);
    await expect(new Elevation(new FakeHttp({ [ELEVATION_URL]: { status: 414 } })).points([[1, 2]])).rejects.toThrow('Altimétrie IGN : HTTP 414');
    await expect(new Elevation(new FakeHttp({ [ELEVATION_URL]: { json: { x: 1 } } })).points([[1, 2]])).rejects.toThrow('réponse illisible');
  });
});

describe('bornes incendie (OSM)', () => {
  it('nœuds et attributs ; une page d’erreur d’Overpass est « indisponible »', async () => {
    const http = new FakeHttp({
      [OVERPASS_URL]: {
        json: { elements: [{ type: 'node', id: 7, lat: 48.8, lon: 2.43, tags: { emergency: 'fire_hydrant', 'fire_hydrant:type': 'pillar', 'fire_hydrant:diameter': '100', ref: 'P12', flow_rate: '60' } }, { type: 'way', id: 8 }] },
      },
    });
    expect(await new Hydrants(http).inBbox([2.42, 48.79, 2.44, 48.81])).toEqual([
      { id: 'node/7', lon: 2.43, lat: 48.8, type: 'pillar', flowRate: '60', diameter: '100', ref: 'P12' },
    ]);
    expect(new URL(http.calls[0]!).searchParams.get('data')).toContain('(48.79000,2.42000,48.81000,2.44000)');
    await expect(new Hydrants(new FakeHttp({ [OVERPASS_URL]: { text: '<html>runtime error</html>' } })).inBbox([0, 0, 1, 1])).rejects.toThrow('instance surchargée');
    await expect(new Hydrants(new FakeHttp({ [OVERPASS_URL]: { status: 429 } })).inBbox([0, 0, 1, 1])).rejects.toThrow('Overpass : HTTP 429');
  });
});
