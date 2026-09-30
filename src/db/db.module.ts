import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';

import { CONFIG, type Config } from '../config/config.ts';
import { DB, createDb, createPool, POOL } from './db.ts';

@Global()
@Module({
  providers: [
    { provide: POOL, inject: [CONFIG], useFactory: (config: Config) => createPool(config.DATABASE_URL) },
    { provide: DB, inject: [POOL], useFactory: createDb },
  ],
  exports: [DB, POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    if (!this.pool.ended) await this.pool.end();
  }
}
