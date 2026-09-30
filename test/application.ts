// Application de test : l'API complète sur la base de test, horloge pilotable.
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';
import type pg from 'pg';

import { ApiModule } from '../src/entrees/api/api.module.ts';
import { configurer } from '../src/entrees/api/app.ts';
import { POOL } from '../src/base/base.ts';
import { Horloge } from '../src/commun/horloge.ts';
import type { Config } from '../src/config/config.ts';
import { REDIS } from '../src/commun/redis.ts';
import { configDeTest } from './environnement.ts';

export class HorlogeDeTest extends Horloge {
  private decalageMs = 0;
  override maintenant(): Date {
    return new Date(Date.now() + this.decalageMs);
  }
  avancer(ms: number): void {
    this.decalageMs += ms;
  }
}

export interface ApplicationDeTest {
  app: NestExpressApplication;
  config: Config;
  horloge: HorlogeDeTest;
  vider(): Promise<void>;
  fermer(): Promise<void>;
}

export async function applicationDeTest(): Promise<ApplicationDeTest> {
  const config = configDeTest();
  const horloge = new HorlogeDeTest();
  const module = await Test.createTestingModule({ imports: [ApiModule.pour(config)] })
    .overrideProvider(Horloge)
    .useValue(horloge)
    .setLogger({ log() {}, error() {}, warn() {} })
    .compile();
  const app = configurer(module.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  const pool = app.get<pg.Pool>(POOL);
  const redis = app.get<Redis>(REDIS);
  return {
    app,
    config,
    horloge,
    vider: async () => {
      await pool.query('TRUNCATE utilisateur, session, reinitialisation_mot_de_passe, journal_audit CASCADE');
      const cles = await redis.keys(`ardha:${config.SESSION_COOKIE_NAME}:limite:*`);
      if (cles.length > 0) await redis.del(...cles);
    },
    fermer: () => app.close(),
  };
}
