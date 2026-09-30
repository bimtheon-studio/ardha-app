// Santé de l'API (pour le déploiement et la surveillance) et document OpenAPI dérivé du contrat.
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { documentOpenApi, routes, type Health } from '../contracts/index.ts';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import type pg from 'pg';

import { POOL } from '../db/db.ts';
import { Public } from './http/session.guard.ts';
import { REDIS } from '../shared/redis.ts';

@Controller('api')
export class SystemController {
  constructor(
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('health')
  @Public()
  async health(@Res({ passthrough: true }) response: Response): Promise<Health> {
    const [db, redis] = await Promise.all([
      this.pool.query('SELECT 1').then(() => 'ok' as const, () => 'injoignable' as const),
      this.redis.ping().then(() => 'ok' as const, () => 'injoignable' as const),
    ]);
    const status = db === 'ok' && redis === 'ok' ? 'ok' : 'degrade';
    if (status !== 'ok') response.status(503);
    return { status, db, redis };
  }

  @Get('openapi.json')
  @Public()
  openapi(): unknown {
    return documentOpenApi(routes, '0.1.0');
  }
}
