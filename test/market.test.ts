// Intégration de l'analyse de marché (F-05) : l'API et le worker dans le même processus, sur les
// réponses enregistrées de geo-DVF (Val-de-Marne 2024-2025), DiDo (ECLN, Sitadel) et de l'INSEE.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketSales, Study, StudyMarket } from '../src/contracts/index.ts';
import { marketKey } from '../src/domain/index.ts';
import { CADASTRE_SOURCE } from '../src/geo/cadastre.service.ts';
import { MarketRepository } from '../src/geo/market.repository.ts';
import { SourceStatesRepository } from '../src/geo/source-states.repository.ts';
import { MarketAnalyses } from '../src/ingestion/market-analyses.ts';
import { MarketAnalyzer } from '../src/ingestion/market-analyzer.ts';
import { DVF_SOURCE, ECLN_SOURCE, MarketData } from '../src/ingestion/market-data.ts';
import { Clock } from '../src/shared/clock.ts';
import { Dido } from '../src/sources/dido.ts';
import { GeoDvf, GEO_DVF_BASE } from '../src/sources/dvf.ts';
import { Insee } from '../src/sources/insee.ts';
import { AnalysesRepository } from '../src/studies/analyses.repository.ts';
import { StudiesRepository } from '../src/studies/studies.repository.ts';
import { MaintenanceProcessor, RECONCILE_JOB } from '../src/worker/maintenance.ts';
import { FakeHttp } from './fake-http.ts';
import { seedParcels } from './reference.ts';
import { signedIn } from './session.ts';
import { createTestApp, type TestApp } from './test-app.ts';

const AY96 = '94046000AY0096';
const AY97 = '94046000AY0097';
const AY98 = '94046000AY0098';

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

async function analyzed(id: string): Promise<StudyMarket> {
  const end = Date.now() + 20_000;
  for (;;) {
    const r = (await get(`/api/studies/${id}/market`)).body as StudyMarket;
    if (r.status === 'ready' || r.status === 'failed' || Date.now() > end) return r;
    await new Promise((res) => setTimeout(res, 25));
  }
}

beforeAll(async () => {
  t = await createTestApp({ worker: true });
  await t.resetReference();
  await seedParcels(t.worker!, [AY96, AY97, AY98]);
  // Le cadastre de Maisons-Alfort compte pour chargé : l'analyse ne le redemande pas en entier.
  const states = t.worker!.get(SourceStatesRepository);
  await states.markLoading(CADASTRE_SOURCE, '94046', new Date());
  await states.markReady(CADASTRE_SOURCE, '94046', '2026-09-01', 3, new Date());
  cookie = await signedIn(t);
}, 60_000);
afterAll(() => t.close());
beforeEach(async () => {
  await t.pool.query('TRUNCATE studies CASCADE');
});

describe('analyse de marché', () => {
  it('jamais demandée, puis calculée par le worker : Maisons-Alfort AY96 + AY97, 500 m', async () => {
    const id = await create([AY96, AY97]);
    const none = (await get(`/api/studies/${id}/market`)).body as StudyMarket;
    expect(none).toMatchObject({ status: 'none', radiusM: 500, stale: false, newerData: false, result: null });
    expect(none.sources.map((s) => s.key)).toEqual(['dvf', 'ecln', 'sitadel', 'insee']);

    const asked = await post(`/api/studies/${id}/market`);
    expect(asked.status).toBe(202);
    const r = await analyzed(id);
    expect(r).toMatchObject({ status: 'ready', stale: false, newerData: false, error: null });
    expect(r.progress.map((s) => [s.key, s.state])).toEqual([
      ['area', 'done'],
      ['dvf', 'done'],
      ['prices', 'done'],
      ['new-build', 'done'],
      ['permits', 'done'],
      ['indices', 'done'],
      ['parcels', 'done'],
    ]);
    expect(r.progress[1]!.detail).toBe('2024 à 2025, 2 millésime(s) chargé(s) à l’instant');
    expect(r.progress[2]!.detail!.replace(/\u202f/g, ' ')).toBe('276 vente(s) comparable(s) sur 331 dans 500 m ; appartements anciens 5 465 €/m², maisons anciennes 6 056 €/m²');

    const res = r.result!;
    expect(res).toMatchObject({ radiusM: 500, covered: true });
    if (res.dvf.status !== 'ok') throw new Error('DVF indisponible');
    expect(res.dvf.data).toMatchObject({
      departments: [{ code: '94', years: [{ year: 2024, modifiedAt: '2026-05-18T12:56:26.000Z' }, { year: 2025, modifiedAt: '2026-05-18T13:14:15.000Z' }] }],
      from: '2024-01-12',
      horizon: '2025-12-31',
      saleCount: 331,
      comparableCount: 276,
    });
    const apartment = res.dvf.data.indicators.find((i) => i.category === 'apartment' && i.segment === 'existing')!;
    expect(apartment).toMatchObject({ current: { count: 131, median: 5465 }, trendPct: -1.3, lowSample: false });
    expect(res.dvf.data.indicators.find((i) => i.category === 'house' && i.segment === 'existing')).toMatchObject({ current: { count: 11, median: 6056 }, lowSample: true });
    expect(res.dvf.data.history.year.filter((p) => p.category === 'apartment' && p.segment === 'existing').map((p) => p.period)).toEqual(['2024', '2025']);
    expect(res.dvf.data.communes[0]).toEqual({ code: '94046', name: 'Maisons-Alfort', sales: expect.any(Number) });

    expect(res.newBuild.status === 'ok' && res.newBuild.data.quarters.find((q) => q.quarter === '2026-T2' && q.housingType === 'collective')).toMatchObject({ pricePerM2: 5739, reservations: 957 });
    expect(res.permits.status === 'ok' && res.permits.data).toMatchObject({ communeCode: '94046', communeName: 'Maisons-Alfort' });
    expect(res.permits.status === 'ok' && res.permits.data.rows.find((x) => x.year === 2025 && x.housingType === 'all')).toMatchObject({ authorizedUnits: 95 });
    expect(res.permits.status === 'ok' && Math.min(...res.permits.data.rows.map((x) => x.year))).toBe(2018);
    expect(res.indices.status === 'ok' && res.indices.data.map((i) => i.id)).toEqual(['000008630', '001710986', '010567045', '010567049', '010567057', '010567061']);
    expect(res.indices.status === 'ok' && res.indices.data[0]).toMatchObject({ last: { period: '2026-Q2', value: 2103 }, yearChangePct: 0.8 });

    // L'étape Foncier et marché de l'étude est faite ; redemander ne refait rien.
    const study = (await get(`/api/studies/${id}`)).body as Study;
    expect(study.marketRadiusM).toBe(500);
    expect(study.steps.find((s) => s.key === 'land')).toEqual({ key: 'land', label: 'Foncier et marché', state: 'done', lot: null });
    expect((await post(`/api/studies/${id}/market`)).body.computedAt).toBe(r.computedAt);
  }, 20_000);

  it('le rayon change : l’étude le garde, l’analyse est refaite ; des parcelles changées la périment', async () => {
    const id = await create([AY96, AY97]);
    await post(`/api/studies/${id}/market`);
    const first = await analyzed(id);
    expect((await post(`/api/studies/${id}/market`, { radiusM: 700 })).status).toBe(400);
    await post(`/api/studies/${id}/market`, { radiusM: 1000 });
    const wider = await analyzed(id);
    expect(wider).toMatchObject({ status: 'ready', radiusM: 1000, stale: false });
    expect(wider.result!.radiusM).toBe(1000);
    expect(wider.result!.dvf.status === 'ok' && wider.result!.dvf.data.saleCount).toBe(1010);
    expect(wider.computedAt).not.toBe(first.computedAt);
    expect(((await get(`/api/studies/${id}`)).body as Study).marketRadiusM).toBe(1000);

    await http().put(`/api/studies/${id}/parcels/${AY98}`).set('Cookie', cookie);
    expect((await get(`/api/studies/${id}/market`)).body).toMatchObject({ status: 'ready', stale: true });
    expect(((await get(`/api/studies/${id}`)).body as Study).steps.find((s) => s.key === 'land')!.state).toBe('todo');

    // Un rayon gardé à la copie.
    const copy = (await post(`/api/studies/${id}/duplicate`)).body as Study;
    expect(copy.marketRadiusM).toBe(1000);
  });

  it('ventes du cercle, les plus récentes d’abord, filtrées ; parcelles vendues chargées en contour', async () => {
    const id = await create([AY96, AY97]);
    const all = (await get(`/api/studies/${id}/market/sales`)).body as MarketSales;
    expect(all).toMatchObject({ radiusM: 500, truncated: false });
    expect(all.sales).toHaveLength(331);
    expect(all.sales.map((s) => s.date)).toEqual([...all.sales.map((s) => s.date)].sort().reverse());
    expect(all.sales.every((s) => s.distanceM <= 500)).toBe(true);
    expect(all.sales.filter((s) => s.category !== null)).toHaveLength(276);
    // Les parcelles vendues présentes dans le cadastre en base (ici AY96 à AY98) viennent avec leur contour.
    const withParcels = all.sales.filter((s) => s.parcels.length > 0);
    expect(withParcels.every((s) => s.parcels.every((p) => [AY96, AY97, AY98].includes(p.id) && (p.geometry as { type: string }).type === 'MultiPolygon'))).toBe(true);

    const houses = (await get(`/api/studies/${id}/market/sales?type=house&segment=existing&from=2025`)).body as MarketSales;
    expect(houses.sales.length).toBeGreaterThan(0);
    expect(houses.sales.every((s) => s.propertyType === 'house' && !s.vefa && s.date >= '2025-01-01')).toBe(true);
    expect((await get(`/api/studies/${id}/market/sales?type=castle`)).status).toBe(400);
  });

  it('réservée à l’auteur ; pas dans la corbeille ; échec affiché et redemandé', async () => {
    const id = await create([AY96, AY97]);
    const other = await signedIn(t);
    expect((await get(`/api/studies/${id}/market`, other)).status).toBe(404);
    expect((await post(`/api/studies/${id}/market`, {}, other)).status).toBe(404);
    expect((await get(`/api/studies/${id}/market/sales`, other)).status).toBe(404);

    const key = (await t.pool.query('SELECT parcels_key FROM studies WHERE id = $1', [id])).rows[0].parcels_key as string;
    await t.app.get(AnalysesRepository).request(id, 'market', marketKey(key, 500), new Date(), false);
    await t.app.get(AnalysesRepository).markFailed(id, 'market', marketKey(key, 500), 'L’analyse de marché a échoué. Relancez-la dans un instant.');
    expect((await get(`/api/studies/${id}/market`)).body).toMatchObject({ status: 'failed', error: 'L’analyse de marché a échoué. Relancez-la dans un instant.' });
    expect((await post(`/api/studies/${id}/market`)).body.status).not.toBe('failed');
    await analyzed(id);

    await http().delete(`/api/studies/${id}`).set('Cookie', cookie);
    expect((await post(`/api/studies/${id}/market`)).status).toBe(409);
    expect((await get(`/api/studies/${id}/market`)).status).toBe(200);
  });

  it('ancienne version du schéma : périmée ; nouveau millésime en base : « données plus récentes »', async () => {
    const id = await create([AY96, AY97]);
    await post(`/api/studies/${id}/market`);
    await analyzed(id);
    const states = t.app.get(SourceStatesRepository);
    await states.markReady(DVF_SOURCE, '94/2025', '2026-11-02T10:00:00.000Z', 19_047, new Date());
    expect((await get(`/api/studies/${id}/market`)).body).toMatchObject({ status: 'ready', stale: false, newerData: true });
    await states.markReady(DVF_SOURCE, '94/2025', '2026-05-18T13:14:15.000Z', 19_047, new Date());

    await t.pool.query(`UPDATE study_analyses SET result = '{"version": 0}' WHERE study_id = $1`, [id]);
    expect((await get(`/api/studies/${id}/market`)).body).toMatchObject({ status: 'ready', stale: true, result: null, newerData: false });
  });

  it('réconciliation : une analyse de marché perdue est relancée par son propre job', async () => {
    const id = await create([AY96, AY97]);
    const key = (await t.pool.query('SELECT parcels_key FROM studies WHERE id = $1', [id])).rows[0].parcels_key as string;
    await t.app.get(AnalysesRepository).request(id, 'market', marketKey(key, 500), new Date(Date.now() - 10 * 60_000), false);
    expect(((await t.worker!.get(MaintenanceProcessor).process({ name: RECONCILE_JOB } as never)) as { analyses: string[] }).analyses).toEqual([id]);
    expect((await analyzed(id)).status).toBe('ready');
  });
});

describe('hors de DVF et sources muettes', () => {
  it('Moselle : « non couvert par DVF », le reste de l’analyse suit', async () => {
    const square = { type: 'MultiPolygon' as const, coordinates: [[[[6.17, 49.11], [6.171, 49.11], [6.171, 49.111], [6.17, 49.11]]]] };
    const parcel = { id: '57463000AB0001', position: 0, communeCode: '57463', prefix: '000', section: 'AB', number: '0001', contenance: 100, area: 100, geometry: square, version: '2026-09-01' };
    const r = await t.worker!.get(MarketAnalyzer).analyze([parcel], 500);
    expect(r.covered).toBe(false);
    expect(r.dvf).toEqual({ status: 'unavailable', error: 'DVF ne couvre pas l’Alsace-Moselle ni Mayotte.' });
    expect(r.newBuild.status).toBe('ok');
    // Sitadel de Metz n'est pas enregistré : indisponible, sans faire tomber l'analyse.
    expect(r.permits.status).toBe('unavailable');
  });

  it('geo-DVF muet sans rien en base : aucun millésime, échec dit ; la copie de l’ECLN sert quand DiDo se tait', async () => {
    const w = t.worker!;
    const clock = w.get(Clock);
    const down = new FakeHttp({ [GEO_DVF_BASE]: { status: 503 }, 'https://data.statistiques': { status: 503 } });
    const data = new MarketData(new GeoDvf(down), new Dido(down), new Insee(down), w.get(MarketRepository), w.get(SourceStatesRepository), clock, { ...t.config });
    expect(await data.ensureDvf(['93'])).toEqual([{ code: '93', years: [], loaded: [], failed: true }]);
    expect(await data.ensureDvf(['67'])).toEqual([]);

    // L'ECLN chargé plus haut a moins de 30 jours : servi sans appel.
    expect((await data.ensureNewBuild()).origin).toBe('fresh');
    t.clock.advance(31 * 24 * 3600 * 1000);
    try {
      const stale = await data.ensureNewBuild();
      expect(stale).toMatchObject({ origin: 'stale', version: '2026-T2' });
      expect((await w.get(SourceStatesRepository).get(ECLN_SOURCE, 'france'))!.status).toBe('ready');
      await expect(data.ensurePermits('93066')).rejects.toThrow('HTTP 503');
    } finally {
      t.clock.advance(-31 * 24 * 3600 * 1000);
    }
  });

  it('un fichier inchangé n’est pas rechargé ; un fichier plus récent l’est, après une publication', async () => {
    const w = t.worker!;
    const data = w.get(MarketData);
    const [before] = await data.ensureDvf(['94']);
    expect(before!.loaded).toEqual([]);
    // Après le 1er avril ou le 1er octobre, l'index est relu : même date de fichier, rien à recharger.
    const states = w.get(SourceStatesRepository);
    await states.markReady(DVF_SOURCE, '94/2024', '2026-05-18T12:56:26.000Z', 16_328, new Date('2026-03-01T00:00:00Z'));
    await states.markReady(DVF_SOURCE, '94/2025', '2025-11-02T00:00:00.000Z', 19_047, new Date('2026-03-01T00:00:00Z'));
    const [after] = await data.ensureDvf(['94']);
    expect(after).toMatchObject({ loaded: [2025], failed: false });
    expect(after!.years.map((y) => y.modifiedAt)).toEqual(['2026-05-18T12:56:26.000Z', '2026-05-18T13:14:15.000Z']);
    expect((await states.get(DVF_SOURCE, '94/2024'))!.loadedAt!.getFullYear()).toBeGreaterThan(2025);
  });

  it('toutes les sources muettes : chaque partie « indisponible », l’analyse aboutit', async () => {
    const w = t.worker!;
    const data = w.get(MarketData);
    const fail = () => Promise.reject(new Error('HTTP 503'));
    const spies = [vi.spyOn(data, 'ensureDvf').mockImplementation(fail), vi.spyOn(data, 'ensureNewBuild').mockImplementation(fail), vi.spyOn(data, 'ensurePermits').mockImplementation(fail), vi.spyOn(data, 'ensureIndices').mockImplementation(fail)];
    try {
      const id = await create([AY96, AY97]);
      const steps: string[] = [];
      const r = await w.get(MarketAnalyzer).analyze(await w.get(StudiesRepository).parcels(id), 250, async (p) => void steps.splice(0, steps.length, ...p.map((x) => `${x.key}:${x.state}:${x.detail}`)));
      expect([r.dvf.status, r.newBuild.status, r.permits.status, r.indices.status]).toEqual(['unavailable', 'unavailable', 'unavailable', 'unavailable']);
      expect(steps).toEqual([
        'area:done:Département 94, dans 250 m',
        'dvf:unavailable:geo-DVF n’a pas répondu',
        'prices:unavailable:Sans ventes DVF, pas de prix',
        'new-build:unavailable:DiDo n’a pas répondu',
        'permits:unavailable:DiDo n’a pas répondu',
        'indices:unavailable:L’INSEE n’a pas répondu',
        expect.stringMatching(/^parcels:done:/),
      ]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('le job : étude changée ou inconnue, rien ; un échec à la dernière tentative est enregistré', async () => {
    const w = t.worker!;
    const runner = w.get(MarketAnalyses);
    const id = await create([AY96, AY97]);
    const key = marketKey((await t.pool.query('SELECT parcels_key FROM studies WHERE id = $1', [id])).rows[0].parcels_key as string, 500);
    expect(await runner.run({ studyId: id, parcelsKey: 'autre@500' })).toBe('stale');
    expect(await runner.run({ studyId: '0193a8b4-0000-7000-8000-000000000000', parcelsKey: key })).toBe('stale');
    // Pas de demande pour cette empreinte : rien à passer en cours.
    expect(await runner.run({ studyId: id, parcelsKey: key })).toBe('stale');

    await t.app.get(AnalysesRepository).request(id, 'market', key, new Date(), false);
    const spy = vi.spyOn(w.get(MarketAnalyzer), 'analyze').mockRejectedValue(new Error('panne'));
    try {
      await expect(runner.run({ studyId: id, parcelsKey: key }, false)).rejects.toThrow('panne');
      expect((await get(`/api/studies/${id}/market`)).body.status).toBe('running');
      await expect(runner.run({ studyId: id, parcelsKey: key })).rejects.toThrow('panne');
      expect((await get(`/api/studies/${id}/market`)).body).toMatchObject({ status: 'failed', error: 'L’analyse de marché a échoué. Relancez-la dans un instant.' });
    } finally {
      spy.mockRestore();
    }
  });

  it('un fichier qui ne se télécharge pas : le département est en échec, les autres millésimes chargés', async () => {
    const w = t.worker!;
    const index = '<a href="/geo-dvf/latest/csv/2025/">2025/</a>';
    const files = '<td><a href="/geo-dvf/latest/csv/2025/departements/93.csv.gz">93.csv.gz</a></td>\n<td>10</td>\n<td>2026-05-18T13:14:15.000Z</td>';
    const http = new FakeHttp({ [`${GEO_DVF_BASE}/$`]: { text: index }, [`${GEO_DVF_BASE}/2025/departements/$`]: { text: files }, [`${GEO_DVF_BASE}/2025/departements/93.csv.gz`]: { status: 503 } });
    const data = new MarketData(new GeoDvf(http), new Dido(http), new Insee(http), w.get(MarketRepository), w.get(SourceStatesRepository), w.get(Clock), { ...t.config });
    expect(await data.ensureDvf(['93'], true)).toEqual([{ code: '93', years: [], loaded: [], failed: true }]);
    expect((await w.get(SourceStatesRepository).get(DVF_SOURCE, '93/2025'))).toMatchObject({ status: 'failed', error: 'geo-DVF 93/2025 : HTTP 503' });
  });
});
