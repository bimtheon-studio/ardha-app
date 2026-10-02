// Application de test : l'API complète sur la base de test, horloge pilotable ; au besoin le worker
// aussi, dans le même processus, sur les mêmes files (préfixe propre au test).
import type { INestApplicationContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import type pg from 'pg';

import type { Config } from '../src/config/config.ts';
import { POOL } from '../src/db/db.ts';
import { ApiModule } from '../src/routes/api.module.ts';
import { configureApp } from '../src/routes/app.ts';
import { rateLimitPrefix } from '../src/routes/http/rate-limit.ts';
import { Clock } from '../src/shared/clock.ts';
import { REDIS } from '../src/shared/redis.ts';
import { WorkerModule } from '../src/worker/worker.module.ts';
import { testConfig } from './env.ts';

export class TestClock extends Clock {
  private offsetMs = 0;
  override now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
  advance(ms: number): void {
    this.offsetMs += ms;
  }
}

export interface TestApp {
  app: NestExpressApplication;
  /** Présent avec `{ worker: true }`. */
  worker?: INestApplicationContext;
  config: Config;
  clock: TestClock;
  pool: pg.Pool;
  /** Vide les comptes et le limiteur ; les données de référence restent (lentes à recharger). */
  reset(): Promise<void>;
  /** Vide aussi les données de référence. */
  resetReference(): Promise<void>;
  close(): Promise<void>;
}

const silent = { log() {}, error() {}, warn() {} };

export async function createWorker(config: Config, clock: Clock): Promise<INestApplicationContext> {
  const module = await Test.createTestingModule({ imports: [WorkerModule.forConfig(config)] })
    .overrideProvider(Clock)
    .useValue(clock)
    .setLogger(silent)
    .compile();
  return module.init();
}

/** Supprime les clés Redis d'un préfixe (files et caches d'un test). */
export async function dropKeys(redis: Redis, prefix: string): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 500);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== '0');
}

export async function createTestApp(options: { worker?: boolean; config?: NodeJS.ProcessEnv } = {}): Promise<TestApp> {
  const config = testConfig(options.config);
  const clock = new TestClock();
  const module = await Test.createTestingModule({ imports: [ApiModule.forConfig(config)] })
    .overrideProvider(Clock)
    .useValue(clock)
    .setLogger(silent)
    .compile();
  const app = configureApp(module.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  const worker = options.worker ? await createWorker(config, clock) : undefined;
  const pool = app.get<pg.Pool>(POOL);
  const redis = app.get<Redis>(REDIS);
  return {
    app,
    ...(worker && { worker }),
    config,
    clock,
    pool,
    reset: async () => {
      await pool.query('TRUNCATE users, sessions, password_resets, audit_logs CASCADE');
      await dropKeys(redis, rateLimitPrefix(config));
    },
    resetReference: async () => {
      await pool.query('TRUNCATE communes, parcels, source_states, hydrants, commune_risks CASCADE');
      await dropKeys(redis, `${config.QUEUE_PREFIX}:lookup-cache`);
    },
    close: async () => {
      await dropKeys(redis, config.QUEUE_PREFIX);
      await worker?.close();
      await app.close();
    },
  };
}
