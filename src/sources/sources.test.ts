// Adaptateurs de sources : sur des réponses fabriquées (cas limites) et sur les réponses réelles
// enregistrées dans fixtures/http (format effectivement servi).
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../config/config.ts';
import { Cadastre, CADASTRE_BASE, parcelsUrl } from './cadastre.ts';
import { Communes, GEO_API_BASE } from './communes.ts';
import { FakeHttp } from '../../test/fake-http.ts';
import { Geocoding, GEOCODING_BASE } from './geocoding.ts';
import { RecordedHttp } from './http.ts';

const recorded = new RecordedHttp(path.join(REPO_ROOT, 'fixtures/http'));
const square = [[[1, 47], [1.001, 47], [1.001, 47.001], [1, 47]]];

describe('Geocoding', () => {
  it('lit la BAN enregistrée : adresse, commune, position', async () => {
    const [a] = await new Geocoding(recorded).search('9 rue Pasteur Maisons-Alfort', 5);
    expect(a).toEqual({
      id: '94046_7120_00009',
      label: '9 Rue Pasteur 94700 Maisons-Alfort',
      name: '9 Rue Pasteur',
      street: 'Rue Pasteur',
      context: '94, Val-de-Marne, Île-de-France',
      kind: 'housenumber',
      lon: expect.closeTo(2.43, 2),
      lat: expect.closeTo(48.8, 2),
      communeCode: '94046',
      city: 'Maisons-Alfort',
      postcode: '94700',
      score: expect.any(Number),
    });
  });

  it('écarte une entité illisible, tolère les champs absents, refuse une réponse fautive', async () => {
    const feature = { geometry: { coordinates: [1, 2] }, properties: { id: 'x', label: 'L', type: 'street', citycode: '37023', city: 'B' } };
    const http = new FakeHttp({ [`${GEOCODING_BASE}/search`]: { json: { features: [feature, { geometry: null }] } } });
    expect(await new Geocoding(http).search('rue', 5)).toEqual([
      { id: 'x', label: 'L', name: 'L', street: 'L', context: '', kind: 'street', lon: 1, lat: 2, communeCode: '37023', city: 'B', postcode: null, score: 0 },
    ]);
    expect(http.calls[0]).toBe(`${GEOCODING_BASE}/search?q=rue&limit=5&index=address`);
    await expect(new Geocoding(new FakeHttp({ [GEOCODING_BASE]: { status: 500 } })).search('rue', 5)).rejects.toThrow('Géocodage : HTTP 500');
    await expect(new Geocoding(new FakeHttp({ [GEOCODING_BASE]: { json: { oups: 1 } } })).search('rue', 5)).rejects.toThrow('réponse illisible');
    expect(await new Geocoding(new FakeHttp({ [GEOCODING_BASE]: { json: { features: [] } } })).reverse(1, 2)).toBeNull();
  });
});

describe('Communes', () => {
  it('lit une commune enregistrée, avec son contour en MultiPolygon', async () => {
    const c = await new Communes(recorded).commune('37023');
    expect(c).toMatchObject({ code: '37023', name: 'Beaumont-Village', departmentCode: '37', postcodes: ['37460'] });
    expect(c?.contour?.type).toBe('MultiPolygon');
  });

  it('404 : null ; département déduit ; Polygon converti ; sans centre ni contour', async () => {
    const http = new FakeHttp({
      [`${GEO_API_BASE}/communes/2A004`]: { json: { code: '2A004', nom: 'Ajaccio', contour: { type: 'Polygon', coordinates: square } } },
      [`${GEO_API_BASE}/communes/97411`]: { json: { code: '97411', nom: 'Saint-Denis' } },
    });
    const communes = new Communes(http);
    expect(await communes.commune('99999')).toBeNull();
    expect(await communes.commune('2A004')).toMatchObject({ departmentCode: '2A', center: null, contour: { type: 'MultiPolygon', coordinates: [square] } });
    expect(await communes.commune('97411')).toMatchObject({ departmentCode: '974', contour: null });
  });

  it('erreurs : HTTP, JSON illisible, forme inattendue', async () => {
    await expect(new Communes(new FakeHttp({ [GEO_API_BASE]: { status: 502 } })).commune('37023')).rejects.toThrow('HTTP 502');
    await expect(new Communes(new FakeHttp({ [GEO_API_BASE]: { text: '<html>' } })).commune('37023')).rejects.toThrow('réponse illisible');
    await expect(new Communes(new FakeHttp({ [GEO_API_BASE]: { json: { code: 1 } } })).commune('37023')).rejects.toThrow('commune 37023 illisible');
    await expect(new Communes(new FakeHttp({ [GEO_API_BASE]: { json: { code: 1 } } })).locate(1, 2)).rejects.toThrow('réponse illisible');
  });

  it('commune d’un point ; à Paris, l’arrondissement', async () => {
    expect(await new Communes(recorded).locate(2.43, 48.8)).toEqual({ code: '94046', name: 'Maisons-Alfort' });
    const http = new FakeHttp({
      [`${GEO_API_BASE}/communes?lon=2.380000&lat=48.857000&fields=nom%2Ccode&format=json&type=`]: { json: [{ code: '75111', nom: 'Paris 11e Arrondissement' }] },
      [`${GEO_API_BASE}/communes?lon=2.380000`]: { json: [{ code: '75056', nom: 'Paris' }] },
      [`${GEO_API_BASE}/communes?lon=2.390000`]: { json: [{ code: '75056', nom: 'Paris' }] },
    });
    expect(await new Communes(http).locate(2.38, 48.857)).toEqual({ code: '75111', name: 'Paris 11e Arrondissement' });
    // Sans arrondissement trouvé, la commune elle-même.
    expect(await new Communes(http).locate(2.39, 48.857)).toEqual({ code: '75056', name: 'Paris' });
  });
});

describe('Cadastre', () => {
  it('millésimes publiés, du plus récent au plus ancien', async () => {
    const versions = await new Cadastre(recorded).versions();
    expect(versions[0]).toBe('2026-09-01');
    expect(versions).toEqual([...versions].sort().reverse());
    await expect(new Cadastre(new FakeHttp({ [CADASTRE_BASE]: { text: 'vide' } })).versions()).rejects.toThrow('aucun millésime');
    await expect(new Cadastre(new FakeHttp({ [CADASTRE_BASE]: { status: 500 } })).versions()).rejects.toThrow('HTTP 500');
  });

  it('parcelles réelles de Beaumont-Village : IDU normalisés, contenances, MultiPolygon', async () => {
    const file = await new Cadastre(recorded).latestParcels('37023');
    expect(file).toMatchObject({ version: '2026-09-01', skipped: 0 });
    expect(file!.parcels).toHaveLength(1145);
    const p = file!.parcels[0]!;
    expect(p.id).toBe(`37023${p.prefix}${p.section}${p.number}`);
    expect(p.geometry.type).toBe('MultiPolygon');
  });

  it('millésime qui n’a pas encore la commune : le précédent ; aucun : null', async () => {
    const index = { text: '<a href="/data/etalab-cadastre/2026-06-01/">x</a><a href="/data/etalab-cadastre/2026-09-01/">y</a>' };
    const f = { id: '37023000AB0001', properties: { contenance: 120 }, geometry: { type: 'Polygon', coordinates: square } };
    const http = new FakeHttp({ [`${CADASTRE_BASE}/$`]: index, [parcelsUrl('2026-06-01', '37023')]: { gzipJson: { features: [f] } } });
    expect(await new Cadastre(http).latestParcels('37023')).toMatchObject({ version: '2026-06-01', parcels: [{ id: '37023000AB0001', contenance: 120, geometry: { type: 'MultiPolygon' } }] });
    expect(await new Cadastre(http).latestParcels('37024')).toBeNull();
  });

  it('fichier déjà décompressé, entités illisibles écartées, fichier fautif refusé', async () => {
    const good = { properties: { id: '37023000AB0002' }, geometry: { type: 'MultiPolygon', coordinates: [square] } };
    const url = parcelsUrl('2026-09-01', '37023');
    const plain = new FakeHttp({ [url]: { json: { features: [good, { id: 'mauvais', properties: {}, geometry: good.geometry }, { properties: {} }] } } });
    expect(await new Cadastre(plain).parcels('37023', '2026-09-01')).toMatchObject({ skipped: 2, parcels: [{ id: '37023000AB0002', contenance: null }] });
    await expect(new Cadastre(new FakeHttp({ [url]: { text: '{' } })).parcels('37023', '2026-09-01')).rejects.toThrow('illisible');
    await expect(new Cadastre(new FakeHttp({ [url]: { json: { oups: [] } } })).parcels('37023', '2026-09-01')).rejects.toThrow('illisible');
    await expect(new Cadastre(new FakeHttp({ [url]: { status: 503 } })).parcels('37023', '2026-09-01')).rejects.toThrow('HTTP 503');
    expect(parcelsUrl('2026-09-01', '97411')).toContain('/communes/974/97411/cadastre-97411-parcelles.json.gz');
  });
});
