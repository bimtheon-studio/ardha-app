// Intégration du worker (F-01) : chargement du cadastre et ses échecs, réconciliation, processeurs,
// seed des communes de référence. Sources fabriquées (FakeHttp) ou enregistrées.
import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Queue, UnrecoverableError } from 'bullmq';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POOL } from '../src/db/db.ts';
import { CADASTRE_SOURCE, CadastreService, loadJobId } from '../src/geo/cadastre.service.ts';
import { SourceStatesRepository } from '../src/geo/source-states.repository.ts';
import { CadastreLoader, userMessage } from '../src/ingestion/cadastre-loader.ts';
import { LookupHandlers } from '../src/ingestion/lookup-handlers.ts';
import { ReferenceSeed } from '../src/ingestion/reference-seed.ts';
import { Clock } from '../src/shared/clock.ts';
import { CADASTRE_QUEUE } from '../src/shared/queues.ts';
import { REDIS } from '../src/shared/redis.ts';
import { CADASTRE_BASE, parcelsUrl } from '../src/sources/cadastre.ts';
import { GEO_API_BASE } from '../src/sources/communes.ts';
import { Http, SourceError } from '../src/sources/http.ts';
import { CadastreProcessor } from '../src/worker/cadastre.processor.ts';
import { LookupsProcessor } from '../src/worker/lookups.processor.ts';
import { MaintenanceProcessor, RECONCILE_JOB } from '../src/worker/maintenance.ts';
import { WorkerModule } from '../src/worker/worker.module.ts';
import { testConfig } from './env.ts';
import { FakeHttp } from './fake-http.ts';
import { dropKeys, TestClock } from './test-app.ts';

const config = testConfig();
const clock = new TestClock();
const fake = new FakeHttp();
let worker: INestApplicationContext;
let pool: pg.Pool;
let states: SourceStatesRepository;

const square = [[[1, 47], [1.001, 47], [1.001, 47.001], [1, 47]]];
const INDEX = { text: '<a href="/data/etalab-cadastre/2026-09-01/">2026-09-01</a>' };
const COMMUNE = { json: { code: '37023', nom: 'Beaumont-Village', codeDepartement: '37', codesPostaux: ['37460'], centre: { coordinates: [1.2, 47.18] } } };

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [WorkerModule.forConfig(config)] })
    .overrideProvider(Http)
    .useValue(fake)
    .overrideProvider(Clock)
    .useValue(clock)
    .setLogger({ log() {}, error() {}, warn() {} })
    .compile();
  worker = await module.init();
  pool = worker.get(POOL);
  states = worker.get(SourceStatesRepository);
});
afterAll(async () => {
  await dropKeys(worker.get<Redis>(REDIS), config.QUEUE_PREFIX);
  await worker.close();
});
beforeEach(async () => {
  await pool.query('TRUNCATE communes, parcels, source_states CASCADE');
  fake.replies = {};
  fake.calls.length = 0;
});

describe('CadastreLoader', () => {
  it('charge commune et parcelles, puis remplace au rechargement', async () => {
    const feature = (n: string) => ({ id: `37023000AB000${n}`, properties: { contenance: 50 }, geometry: { type: 'Polygon', coordinates: square } });
    fake.replies = {
      [`${CADASTRE_BASE}/$`]: INDEX,
      [`${GEO_API_BASE}/communes/37023`]: COMMUNE,
      [parcelsUrl('2026-09-01', '37023')]: { gzipJson: { features: [feature('1'), feature('2')] } },
    };
    const loader = worker.get(CadastreLoader);
    expect(await loader.load('37023')).toEqual({ code: '37023', name: 'Beaumont-Village', version: '2026-09-01', parcels: 2, skipped: 0 });
    fake.replies[parcelsUrl('2026-09-01', '37023')] = { gzipJson: { features: [feature('3')] } };
    await loader.load('37023');
    const ids = (await pool.query('SELECT id FROM parcels ORDER BY id')).rows.map((r) => r.id);
    expect(ids).toEqual(['37023000AB0003']);
    expect(await states.get(CADASTRE_SOURCE, '37023')).toMatchObject({ status: 'ready', version: '2026-09-01', itemCount: 1, attempts: 2, error: null });
  });

  it('commune inconnue, cadastre non publié : échec définitif, message clair', async () => {
    fake.replies = { [`${CADASTRE_BASE}/$`]: INDEX, [`${GEO_API_BASE}/communes/37023`]: COMMUNE };
    const loader = worker.get(CadastreLoader);
    await expect(loader.load('99999', true)).rejects.toThrow('Commune 99999 inconnue.');
    expect(await states.get(CADASTRE_SOURCE, '99999')).toMatchObject({ status: 'failed', error: 'Commune 99999 inconnue.' });
    await expect(loader.load('37023')).rejects.toThrow('Aucun cadastre publié pour Beaumont-Village (37023).');
  });

  it('source injoignable : reste « en cours » tant que le worker réessaie, puis « en échec »', async () => {
    fake.replies = { [GEO_API_BASE]: new SourceError('geo.api.gouv.fr', 'unavailable', 'HTTP 502') };
    const loader = worker.get(CadastreLoader);
    await expect(loader.load('37023', true)).rejects.toThrow('HTTP 502');
    expect(await states.get(CADASTRE_SOURCE, '37023')).toMatchObject({ status: 'loading', error: 'Le cadastre est momentanément injoignable ; nouvel essai automatique.' });
    await expect(loader.load('37023', false)).rejects.toThrow();
    expect((await states.get(CADASTRE_SOURCE, '37023'))?.status).toBe('failed');
    expect(userMessage(new Error('x'))).toBe('Le chargement du cadastre a échoué.');
  });
});

describe('processeurs', () => {
  it('cadastre : tâche inconnue refusée ; échec définitif sans nouvel essai', async () => {
    const p = worker.get(CadastreProcessor);
    await expect(p.process({ name: 'autre', data: { code: '37023' }, opts: {}, attemptsMade: 0 } as never)).rejects.toThrow('Tâche inconnue');
    fake.replies = { [`${CADASTRE_BASE}/$`]: INDEX };
    await expect(p.process({ name: 'cadastre:load-commune', data: { code: '99999' }, opts: { attempts: 3 }, attemptsMade: 0 } as never)).rejects.toBeInstanceOf(UnrecoverableError);
    fake.replies = { [GEO_API_BASE]: new SourceError('geo.api.gouv.fr', 'unavailable', 'HTTP 502') };
    await expect(p.process({ name: 'cadastre:load-commune', data: { code: '37023' }, opts: {}, attemptsMade: 0 } as never)).rejects.toBeInstanceOf(SourceError);
  });

  it('lookups : un job trop vieux n’est plus traité ; les autres le sont', async () => {
    const p = worker.get(LookupsProcessor);
    expect(await p.process({ name: 'address:search', data: { q: 'x', limit: 1 }, timestamp: Date.now() - 60_000 } as never)).toBeNull();
    fake.replies = { [GEO_API_BASE]: { json: [{ code: '37023', nom: 'Beaumont-Village' }] } };
    expect(await p.process({ name: 'commune:locate', data: { lon: 1.2, lat: 47.18 }, timestamp: Date.now() } as never)).toEqual({ code: '37023', name: 'Beaumont-Village' });
    await expect(worker.get(LookupHandlers).handle('inconnu' as never, {} as never)).rejects.toThrow('Recherche inconnue');
  });
});

describe('réconciliation', () => {
  it('réenfile ce qui est resté en file ou en cours trop longtemps, pas le reste', async () => {
    const queue = worker.get<Queue>(getQueueToken(CADASTRE_QUEUE));
    await queue.pause();
    const old = new Date(Date.now() - 60 * 60_000);
    await states.request(CADASTRE_SOURCE, '37023', old);
    await states.request(CADASTRE_SOURCE, '94046', new Date());
    await states.markLoading(CADASTRE_SOURCE, '37261', old);
    await pool.query(`UPDATE source_states SET updated_at = $1 WHERE scope = '37261'`, [old]);
    const result = await worker.get(MaintenanceProcessor).process({ name: RECONCILE_JOB } as never);
    expect(result).toEqual(['37023', '37261']);
    expect(await queue.getJob(loadJobId('37023'))).toBeDefined();
    expect(await queue.getJob(loadJobId('94046'))).toBeUndefined();
    await queue.obliterate({ force: true });
  });

  it('une demande sur un cadastre prêt ne fait rien, sauf à forcer ; un échec se relance', async () => {
    const queue = worker.get<Queue>(getQueueToken(CADASTRE_QUEUE));
    await queue.pause();
    const service = worker.get(CadastreService);
    await states.markLoading(CADASTRE_SOURCE, '37023', new Date());
    await states.markReady(CADASTRE_SOURCE, '37023', '2026-09-01', 10, new Date());
    expect((await service.requestLoad('37023')).cadastre.status).toBe('ready');
    expect((await service.requestLoad('37023', true)).cadastre.status).toBe('queued');
    await states.markFailed(CADASTRE_SOURCE, '37023', 'x', new Date(), false);
    expect((await service.requestLoad('37023')).cadastre).toMatchObject({ status: 'queued', error: null });
    await queue.obliterate({ force: true });
  });
});

describe('seed des communes de référence', () => {
  it('charge depuis les réponses enregistrées, puis ne recharge pas', async () => {
    const seed = worker.get(ReferenceSeed);
    const first = await seed.run(['37023', '94046']);
    expect(first).toEqual([
      { code: '37023', name: 'Beaumont-Village', parcels: 1145, version: '2026-09-01', skipped: false },
      { code: '94046', name: 'Maisons-Alfort', parcels: 5873, version: '2026-09-01', skipped: false },
    ]);
    const second = await seed.run(['37023']);
    expect(second).toEqual([{ code: '37023', name: 'Beaumont-Village', parcels: 1145, version: '2026-09-01', skipped: true }]);
    expect(fake.calls).toEqual([]);
  });
});
