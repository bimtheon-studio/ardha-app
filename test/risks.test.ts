// Intégration de l'analyse des risques (F-04) : l'API et le worker dans le même processus, sur les
// réponses enregistrées de Géorisques, du BRGM, de l'IGN et d'OpenStreetMap (sans Internet).
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Study, StudyRisks } from '../src/contracts/index.ts';
import { AnalysesRepository } from '../src/studies/analyses.repository.ts';
import { vi } from 'vitest';

import { HydrantCache } from '../src/ingestion/hydrant-cache.ts';
import { RiskAnalyses } from '../src/ingestion/risk-analyses.ts';
import { Hydrants } from '../src/sources/hydrants.ts';
import { RiskAnalyzer } from '../src/ingestion/risk-analyzer.ts';
import { MaintenanceProcessor, RECONCILE_JOB } from '../src/worker/maintenance.ts';
import { seedParcels } from './reference.ts';
import { signedIn } from './session.ts';
import { createTestApp, type TestApp } from './test-app.ts';

const AY96 = '94046000AY0096';
const AY97 = '94046000AY0097';
const AY98 = '94046000AY0098';
const AY145 = '94046000AY0145';
const ZA1 = '37023000ZA0001';

let t: TestApp;
let cookie: string;
const http = () => request(t.app.getHttpServer());
const get = (path: string, c = cookie) => http().get(path).set('Cookie', c);
const post = (path: string, body: object = {}, c = cookie) => http().post(path).set('Cookie', c).send(body);

async function create(parcelIds: string[]): Promise<string> {
  const r = await post('/api/studies', { parcelIds });
  expect(r.status).toBe(201);
  return (r.body as Study).id;
}

async function analyzed(id: string): Promise<StudyRisks> {
  const end = Date.now() + 15_000;
  for (;;) {
    const r = (await get(`/api/studies/${id}/risks`)).body as StudyRisks;
    if (r.status === 'ready' || r.status === 'failed' || Date.now() > end) return r;
    await new Promise((res) => setTimeout(res, 25));
  }
}

beforeAll(async () => {
  t = await createTestApp({ worker: true });
  await t.resetReference();
  await seedParcels(t.worker!, [AY96, AY97, AY98, AY145, ZA1]);
  cookie = await signedIn(t);
});
afterAll(() => t.close());
beforeEach(async () => {
  await t.pool.query('TRUNCATE studies CASCADE');
});

describe('analyse des risques', () => {
  it('jamais demandée, puis demandée, calculée par le worker : Maisons-Alfort AY96 + AY97', async () => {
    const id = await create([AY96, AY97]);
    const none = (await get(`/api/studies/${id}/risks`)).body as StudyRisks;
    expect(none).toMatchObject({ status: 'none', stale: false, result: null, axes: null });
    expect(none.sources.map((s) => s.key)).toEqual(['georisques', 'tri', 'altimetrie', 'osm']);

    const asked = await post(`/api/studies/${id}/risks`);
    expect(asked.status).toBe(202);
    expect(['queued', 'running', 'ready']).toContain(asked.body.status);

    const r = await analyzed(id);
    expect(r).toMatchObject({ status: 'ready', stale: false, error: null });
    expect(r.axes!.map((a) => [a.key, a.severity, a.state])).toEqual([
      ['flood', 'medium', 'Aléa moyen'],
      ['clay', 'medium', 'Exposition moyen'],
      ['radon', 'low', 'Classe 1 · Faible'],
      ['seismic', 'none', 'Zone 1 · Très faible'],
    ]);
    const res = r.result!;
    const [commune] = res.communes;
    expect(commune).toMatchObject({ code: '94046', name: 'Maisons-Alfort', radon: { status: 'ok', data: 1 }, seismic: { status: 'ok', data: 1 } });
    expect(commune!.plans.status === 'ok' && commune!.plans.data.find((p) => p.label === 'PPRI Marne et Seine')).toMatchObject({
      flood: true,
      model: 'PPRN-I',
      url: 'https://www.georisques.gouv.fr/risques/plans-prevention-risques/donnees#/dossier/94DDT20090002',
    });
    expect(commune!.catnat).toMatchObject({ status: 'ok', data: { count: 9 } });
    const [ay96] = res.parcels;
    expect(ay96).toMatchObject({ id: AY96, label: 'AY 96', clay: { status: 'ok', data: 'moyen' } });
    expect(ay96!.flood).toMatchObject({ status: 'ok', data: { hazard: 'moyen', reference: { height: 2, atLeast: true } } });
    expect(ay96!.elevation).toMatchObject({ status: 'ok', data: { min: 32.14, max: 32.55, points: 11 } });
    expect(ay96!.floodLevel).toEqual({ level: 34.31, atLeast: true });
    expect(res.installations).toMatchObject({ status: 'ok', data: { count: 37 } });
    expect(res.installations.status === 'ok' && res.installations.data.items.every((i) => i.distanceM <= 500)).toBe(true);
    expect(res.hydrants.status === 'ok' && res.hydrants.data.items[0]!.distanceM).toBe(111);
    expect(res.cavities).toEqual({ status: 'ok', data: { truncated: false, items: [] } });

    // L'étape Risques de l'étude est faite.
    const study = (await get(`/api/studies/${id}`)).body as Study;
    expect(study.steps.find((s) => s.key === 'risks')).toEqual({ key: 'risks', label: 'Risques', state: 'done', lot: null });
    // Redemander une analyse à jour ne refait rien.
    expect((await post(`/api/studies/${id}/risks`)).body.computedAt).toBe(r.computedAt);
  });

  it('les parcelles changent : l’analyse est périmée, l’étape redevient à faire', async () => {
    const id = await create([AY96, AY97]);
    await post(`/api/studies/${id}/risks`);
    await analyzed(id);
    await http().put(`/api/studies/${id}/parcels/${AY98}`).set('Cookie', cookie);
    const r = (await get(`/api/studies/${id}/risks`)).body as StudyRisks;
    expect(r).toMatchObject({ status: 'ready', stale: true });
    expect(((await get(`/api/studies/${id}`)).body as Study).steps.find((s) => s.key === 'risks')!.state).toBe('todo');
  });

  it('une source muette est « indisponible », jamais « aucun risque » (Q4)', async () => {
    // AY145 : réponses de la commune enregistrées, pas celles de la parcelle (argiles, TRI, altitudes, bornes).
    const id = await create([AY145]);
    await post(`/api/studies/${id}/risks`);
    const r = await analyzed(id);
    expect(r.status).toBe('ready');
    const axes = Object.fromEntries(r.axes!.map((a) => [a.key, a]));
    expect(axes.clay).toMatchObject({ state: 'Source indisponible : à vérifier', severity: 'unknown' });
    // Le PPR inondation de la commune reste connu.
    expect(axes.flood).toMatchObject({ state: 'PPR inondation sur la commune', severity: 'medium' });
    expect(r.result!.parcels[0]!.clay.status).toBe('unavailable');
    // Les bornes, elles, viennent des cases déjà chargées pour l'étude voisine (cache, 30 jours).
    expect(r.result!.hydrants.status).toBe('ok');
    expect(r.result!.parcels[0]!.floodLevel).toBeNull();
  });

  it('Beaumont-Village ZA1 : argiles fort, sismicité 2, hors zone inondable, aucune borne', async () => {
    const id = await create([ZA1]);
    await post(`/api/studies/${id}/risks`);
    const r = await analyzed(id);
    expect(r.axes!.map((a) => [a.key, a.severity])).toEqual([
      ['clay', 'high'],
      ['radon', 'low'],
      ['seismic', 'low'],
      ['flood', 'none'],
    ]);
    expect(r.result!.hydrants).toMatchObject({ status: 'ok', data: { items: [] } });
  });

  it('réservée à l’auteur ; pas dans la corbeille ; recalcul forcé ; échec affiché', async () => {
    const id = await create([AY96, AY97]);
    const other = await signedIn(t);
    expect((await get(`/api/studies/${id}/risks`, other)).status).toBe(404);
    expect((await post(`/api/studies/${id}/risks`, {}, other)).status).toBe(404);
    expect((await get('/api/studies/pas-un-uuid/risks')).status).toBe(400);

    await post(`/api/studies/${id}/risks`);
    const first = await analyzed(id);
    const forced = await post(`/api/studies/${id}/risks`, { force: true });
    expect(forced.body.status).not.toBe('ready');
    expect((await analyzed(id)).computedAt).not.toBe(first.computedAt);

    const key = (await t.pool.query('SELECT parcels_key FROM studies WHERE id = $1', [id])).rows[0].parcels_key as string;
    await t.app.get(AnalysesRepository).markFailed(id, 'risks', key, 'L’analyse des risques a échoué. Relancez-la dans un instant.');
    expect((await get(`/api/studies/${id}/risks`)).body).toMatchObject({ status: 'failed', error: 'L’analyse des risques a échoué. Relancez-la dans un instant.' });
    // Une analyse en échec se redemande.
    expect((await post(`/api/studies/${id}/risks`)).body.status).not.toBe('failed');
    await analyzed(id);

    await http().delete(`/api/studies/${id}`).set('Cookie', cookie);
    expect((await post(`/api/studies/${id}/risks`)).status).toBe(409);
    expect((await get(`/api/studies/${id}/risks`)).status).toBe(200);
  });

  it('un résultat d’une ancienne version du schéma est périmé et ne se lit plus', async () => {
    const id = await create([AY96, AY97]);
    await post(`/api/studies/${id}/risks`);
    await analyzed(id);
    await t.pool.query(`UPDATE study_analyses SET result = '{"version": 0}' WHERE study_id = $1`, [id]);
    expect((await get(`/api/studies/${id}/risks`)).body).toMatchObject({ status: 'ready', stale: true, result: null, axes: null });
  });

  it('réconciliation : une analyse en file dont le job s’est perdu est relancée', async () => {
    const id = await create([AY96, AY97]);
    const key = (await t.pool.query('SELECT parcels_key FROM studies WHERE id = $1', [id])).rows[0].parcels_key as string;
    await t.app.get(AnalysesRepository).request(id, 'risks', key, new Date(Date.now() - 10 * 60_000), false);
    expect(((await t.worker!.get(MaintenanceProcessor).process({ name: RECONCILE_JOB } as never)) as { analyses: string[] }).analyses).toEqual([id]);
    expect((await analyzed(id)).status).toBe('ready');
  });
});

describe('exécution', () => {
  it('ne calcule rien pour une étude inconnue, des parcelles changées ou une analyse non demandée ; un échec final est enregistré', async () => {
    const id = await create([AY96, AY97]);
    const runner = t.worker!.get(RiskAnalyses);
    const key = (await t.pool.query('SELECT parcels_key FROM studies WHERE id = $1', [id])).rows[0].parcels_key as string;
    expect(await runner.run({ studyId: '0193a8b4-0000-7000-8000-000000000000', parcelsKey: key })).toBe('stale');
    expect(await runner.run({ studyId: id, parcelsKey: 'autre' })).toBe('stale');
    expect(await runner.run({ studyId: id, parcelsKey: key })).toBe('stale');

    await t.app.get(AnalysesRepository).request(id, 'risks', key, new Date(), false);
    const spy = vi.spyOn(t.worker!.get(RiskAnalyzer), 'analyze').mockRejectedValue(new Error('panne'));
    await expect(runner.run({ studyId: id, parcelsKey: key }, false)).rejects.toThrow('panne');
    expect((await t.app.get(AnalysesRepository).get(id, 'risks'))!.status).toBe('running');
    await expect(runner.run({ studyId: id, parcelsKey: key })).rejects.toThrow('panne');
    expect((await t.app.get(AnalysesRepository).get(id, 'risks'))!.status).toBe('failed');
    spy.mockRestore();
  });
});

describe('altitudes d’une sélection (Q6)', () => {
  it('par le worker, sur le même échantillon que l’analyse : par parcelle et en tout', async () => {
    const r = await get(`/api/parcels/elevation?ids=${AY96},${AY97}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      overall: { min: 31.88, max: 32.55, mean: 32.2, range: 0.67, points: 23 },
      parcels: [
        { id: AY96, stats: { min: 32.14, max: 32.55, points: 11 } },
        { id: AY97, stats: { min: 31.88, max: 32.3, points: 12 } },
      ],
      source: expect.stringContaining('RGE ALTI'),
    });
    expect((await get('/api/parcels/elevation?ids=x')).status).toBe(400);
    expect((await get('/api/parcels/elevation?ids=94046000ZZ9999')).status).toBe(404);
    expect((await http().get(`/api/parcels/elevation?ids=${AY96}`)).status).toBe(401);
  });
});

describe('cache des bornes incendie', () => {
  it('cases gardées 30 jours en base : pas de nouvel appel ; case vieille et Overpass en panne : les bornes connues servent', async () => {
    const cache = t.worker!.get(HydrantCache);
    const overpass = t.worker!.get(Hydrants);
    const spy = vi.spyOn(overpass, 'inBbox');
    // Emprise AY96 + AY97 élargie de 400 m (celle de l'analyse) : cases enregistrées.
    const bbox = [2.4243, 48.7963, 2.4357, 48.8038] as const;
    await t.pool.query(`DELETE FROM source_states WHERE source = 'osm-hydrants'`);
    const first = await cache.inBbox(bbox);
    const calls = spy.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(first.items.length).toBeGreaterThan(0);
    // Une seconde étude voisine : tout vient de la base.
    expect((await cache.inBbox(bbox)).items).toEqual(first.items);
    expect(spy.mock.calls.length).toBe(calls);

    // 31 jours plus tard, Overpass sature : les bornes connues restent, datées.
    t.clock.advance(31 * 24 * 3600 * 1000);
    spy.mockRejectedValue(new Error('Overpass : HTTP 429'));
    const stale = await cache.inBbox(bbox);
    expect(stale.items).toEqual(first.items);
    expect(stale.asOf.getTime()).toBeLessThan(t.clock.now().getTime() - 30 * 24 * 3600 * 1000);
    // Une case jamais chargée, elle, ne peut rien servir.
    await expect(cache.inBbox([10.001, 45.001, 10.002, 45.002])).rejects.toThrow('HTTP 429');
    t.clock.advance(-31 * 24 * 3600 * 1000);
    spy.mockRestore();
  });
});
