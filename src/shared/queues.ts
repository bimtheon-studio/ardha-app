// Files BullMQ partagées par l'API (qui dépose), le worker (qui consomme) et la CLI. Redis ne porte
// que « quoi faire maintenant » ; l'état du travail vit dans Postgres (PLAN §3).
import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';

import { CONFIG, type Config } from '../config/config.ts';

export const CADASTRE_QUEUE = 'cadastre';
export const LOOKUPS_QUEUE = 'lookups';
export const MAINTENANCE_QUEUE = 'maintenance';
export const STUDIES_QUEUE = 'studies';

export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    db: Number(u.pathname.slice(1) || 0),
    ...(u.username && { username: decodeURIComponent(u.username) }),
    ...(u.password && { password: decodeURIComponent(u.password) }),
    ...(u.protocol === 'rediss:' && { tls: {} }),
    // Exigé par BullMQ pour ses connexions bloquantes.
    maxRetriesPerRequest: null,
  };
}

/** Connexion de BullMQ, une fois par application (API, worker, CLI) ; les modules déclarent leurs files. */
@Module({})
export class QueuesModule {
  static forRoot(): DynamicModule {
    return {
      module: QueuesModule,
      imports: [
        BullModule.forRootAsync({
          inject: [CONFIG],
          useFactory: (c: Config) => ({ connection: redisConnection(c.REDIS_URL), prefix: c.QUEUE_PREFIX }),
        }),
      ],
    };
  }
}
