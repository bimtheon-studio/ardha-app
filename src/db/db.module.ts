import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';

import { CONFIG, type Config } from '../config/config.ts';
import { BASE, creerBase, creerPool, POOL } from './db.ts';

@Global()
@Module({
  providers: [
    { provide: POOL, inject: [CONFIG], useFactory: (config: Config) => creerPool(config.DATABASE_URL) },
    { provide: BASE, inject: [POOL], useFactory: creerBase },
  ],
  exports: [BASE, POOL],
})
export class BaseModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    if (!this.pool.ended) await this.pool.end();
  }
}
