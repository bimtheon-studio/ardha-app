// Application de test : l'API complète sur la base de test, horloge pilotable.
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';
import type pg from 'pg';

import { ApiModule } from '../src/routes/api.module.ts';
import { configureApp } from '../src/routes/app.ts';
import { POOL } from '../src/db/db.ts';
import { Clock } from '../src/shared/clock.ts';
import type { Config } from '../src/config/config.ts';
import { REDIS } from '../src/shared/redis.ts';
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
  config: Config;
  clock: TestClock;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const config = testConfig();
  const clock = new TestClock();
  const module = await Test.createTestingModule({ imports: [ApiModule.forConfig(config)] })
    .overrideProvider(Clock)
    .useValue(clock)
    .setLogger({ log() {}, error() {}, warn() {} })
    .compile();
  const app = configureApp(module.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  const pool = app.get<pg.Pool>(POOL);
  const redis = app.get<Redis>(REDIS);
  return {
    app,
    config,
    clock,
    reset: async () => {
      await pool.query('TRUNCATE utilisateur, session, reinitialisation_mot_de_passe, journal_audit CASCADE');
      const keys = await redis.keys(`ardha:${config.SESSION_COOKIE_NAME}:limite:*`);
      if (keys.length > 0) await redis.del(...keys);
    },
    close: () => app.close(),
  };
}
