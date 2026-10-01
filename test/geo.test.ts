// Intégration de la carte et du parcellaire (F-01) : l'API réelle et le worker dans le même
// processus, sur les réponses enregistrées des sources (sans Internet).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MAP_LAYERS } from '../src/geo/map-layers.ts';
import { CadastreLoader } from '../src/ingestion/cadastre-loader.ts';
import { type TestApp, createTestApp } from './test-app.ts';
import { signedIn } from './session.ts';

let t: TestApp;
let cookie: string;
const get = (path: string) => request(t.app.getHttpServer()).get(path).set('Cookie', cookie);

// Beaumont-Village (37023), la petite commune de référence : 1 145 parcelles au millésime 2026-09-01.
const BEAUMONT = [1.2, 47.175, 1.215, 47.19] as const;

async function waitFor<T>(read: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await read();
    if (done(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeAll(async () => {
  t = await createTestApp({ worker: true });
  await t.resetReference();
  cookie = await signedIn(t);
});
afterAll(() => t.close());

describe('accès', () => {
  it('exige une session', async () => {
    const r = await request(t.app.getHttpServer()).get('/api/parcels?bbox=0.9,47.19,0.91,47.2');
    expect(r.status).toBe(401);
  });

  it('sert les fonds de carte : IGN, et OpenStreetMap (Q8)', async () => {
    const r = await get('/api/map/layers');
    expect(r.status).toBe(200);
    expect(r.body).toEqual(MAP_LAYERS);
    expect(r.body.basemaps.map((b: { id: string }) => b.id)).toEqual(['plan', 'ortho', 'osm']);
  });
});

describe('chargement d’une commune', () => {
  it('jamais demandée, puis mise en file, chargée par le worker, et sans effet une fois prête', async () => {
    expect((await get('/api/communes/37023')).body).toEqual({
      code: '37023',
      name: null,
      center: null,
      cadastre: { status: 'missing', version: null, loadedAt: null, parcelCount: null, error: null },
    });

    const queued = await request(t.app.getHttpServer()).post('/api/communes/37023/cadastre').set('Cookie', cookie);
    expect(queued.status).toBe(202);
    expect(['queued', 'loading', 'ready']).toContain(queued.body.cadastre.status);

    const ready = await waitFor(
      async () => (await get('/api/communes/37023')).body,
      (c) => c.cadastre.status === 'ready',
    );
    expect(ready).toMatchObject({ code: '37023', name: 'Beaumont-Village', cadastre: { status: 'ready', version: '2026-09-01', parcelCount: 1145, error: null } });
    expect(ready.center).toEqual([expect.closeTo(1.2065, 3), expect.closeTo(47.1824, 3)]);

    const again = await request(t.app.getHttpServer()).post('/api/communes/37023/cadastre').set('Cookie', cookie);
    expect(again.body.cadastre.status).toBe('ready');
  });

  it('refuse un code qui n’est pas un code INSEE', async () => {
    const r = await get('/api/communes/9404');
    expect(r.status).toBe(400);
    expect(r.body.fields).toEqual({ code: 'Code commune invalide.' });
  });
});

describe('parcelles', () => {
  beforeAll(async () => {
    const c = await get('/api/communes/37023');
    if (c.body.cadastre.status !== 'ready') await t.worker!.get(CadastreLoader).load('37023');
  });

  it('d’une emprise : GeoJSON, libellés, contenances', async () => {
    const r = await get(`/api/parcels?bbox=${BEAUMONT.join(',')}`);
    expect(r.status).toBe(200);
    expect(r.body.type).toBe('FeatureCollection');
    expect(r.body.truncated).toBe(false);
    expect(r.body.features.length).toBeGreaterThan(100);
    const f = r.body.features[0];
    expect(f).toMatchObject({ type: 'Feature', geometry: { type: 'MultiPolygon' }, properties: { communeCode: '37023', prefix: '000' } });
    expect(f.id).toMatch(/^37023000[0-9A-Z]{2}\d{4}$/);
    expect(f.properties.label).toMatch(/^[0-9A-Z]{1,2} \d+$/);
  });

  it('par identifiants, dans l’ordre demandé, sans les inconnus ni les doublons', async () => {
    const some = (await get(`/api/parcels?bbox=${BEAUMONT.join(',')}`)).body.features.slice(0, 3).map((f: { id: string }) => f.id);
    const ids = [some[2], '37023000ZZ9999', some[0], some[2]];
    const r = await get(`/api/parcels?ids=${ids.join(',')}`);
    expect(r.status).toBe(200);
    expect(r.body.features.map((f: { id: string }) => f.id)).toEqual([some[2], some[0]]);
  });

  it('refuse une emprise trop grande, invalide, ou une requête ambiguë', async () => {
    const big = await get('/api/parcels?bbox=1.1,47.1,1.2,47.2');
    expect(big.status).toBe(400);
    expect(big.body.message).toMatch(/Zone trop étendue/);
    expect((await get('/api/parcels?bbox=1,2,3')).body.fields).toEqual({ bbox: 'Emprise invalide : ouest,sud,est,nord en degrés.' });
    expect((await get('/api/parcels')).body.fields).toEqual({ _: 'Indiquez une emprise (bbox) ou des identifiants (ids).' });
    expect((await get('/api/parcels?ids=abc')).body.fields).toEqual({ ids: 'Identifiant de parcelle invalide.' });
    const many = Array.from({ length: 51 }, (_, i) => `37023000AB${String(i).padStart(4, '0')}`).join(',');
    expect((await get(`/api/parcels?ids=${many}`)).body.fields).toEqual({ ids: 'Au plus 50 parcelles.' });
  });
});

describe('recherches par le worker', () => {
  it('suggère des adresses, puis répond depuis le cache', async () => {
    const r = await get('/api/addresses/search?q=Beaumont-Village');
    expect(r.status).toBe(200);
    expect(r.body.addresses).toHaveLength(5);
    expect(r.body.addresses[0]).toMatchObject({ label: 'Beaumont-Village', kind: 'municipality', communeCode: '37023', city: 'Beaumont-Village' });
    const cached = await get('/api/addresses/search?q=Beaumont-Village');
    expect(cached.body).toEqual(r.body);
  });

  it('refuse une saisie trop courte', async () => {
    const r = await get('/api/addresses/search?q=ab');
    expect(r.status).toBe(400);
    expect(r.body.fields).toEqual({ q: 'Saisissez au moins 3 caractères.' });
  });

  it('géocodage inverse', async () => {
    const r = await get('/api/addresses/reverse?lon=2.43&lat=48.8');
    expect(r.body.address).toMatchObject({ label: '9 Rue Pasteur 94700 Maisons-Alfort', communeCode: '94046' });
    expect((await get('/api/addresses/reverse?lon=200&lat=48.8')).body.fields).toEqual({ lon: 'Longitude invalide.' });
  });

  it('commune d’un point : d’abord parmi les communes chargées, sinon par le worker', async () => {
    expect((await get('/api/communes/locate?lon=1.2065&lat=47.1824')).body).toEqual({ commune: { code: '37023', name: 'Beaumont-Village' } });
    expect((await get('/api/communes/locate?lon=2.43&lat=48.8')).body).toEqual({ commune: { code: '94046', name: 'Maisons-Alfort' } });
    expect((await get('/api/communes/locate?lon=-3.5&lat=47')).body).toEqual({ commune: null });
  });

  it('une source sans réponse enregistrée : 503, message pour l’utilisateur', async () => {
    const r = await get('/api/addresses/search?q=adresse%20jamais%20enregistr%C3%A9e');
    expect(r.status).toBe(503);
    expect(r.body.message).toBe('La recherche est momentanément indisponible. Réessayez dans un instant.');
  });
});

describe('sans worker', () => {
  it('la recherche échoue proprement au bout du délai', async () => {
    const alone = await createTestApp({ config: { LOOKUP_TIMEOUT_MS: '200' } });
    try {
      const c = await signedIn(alone);
      const r = await request(alone.app.getHttpServer()).get('/api/addresses/search?q=Tours%20centre').set('Cookie', c);
      expect(r.status).toBe(503);
    } finally {
      await alone.close();
    }
  });
});
