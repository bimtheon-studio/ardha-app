// Santé de l'API sur `/up`, hors de `/api` : le chemin que once et kamal-proxy interrogent (D-13),
// qui sert aussi à la surveillance et aux attentes de démarrage. Document OpenAPI dérivé du contrat.
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { documentOpenApi, routes, type Health } from '../contracts/index.ts';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import type pg from 'pg';

import { POOL } from '../db/db.ts';
import { Public } from './http/session.guard.ts';
import { REDIS } from '../shared/redis.ts';

@Controller()
export class SystemController {
  constructor(
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('up')
  @Public()
  async up(@Res({ passthrough: true }) response: Response): Promise<Health> {
    const [db, redis] = await Promise.all([
      this.pool.query('SELECT 1').then(() => 'ok' as const, () => 'unreachable' as const),
      this.redis.ping().then(() => 'ok' as const, () => 'unreachable' as const),
    ]);
    const status = db === 'ok' && redis === 'ok' ? 'ok' : 'degraded';
    if (status !== 'ok') response.status(503);
    return { status, db, redis };
  }

  @Get('api/openapi.json')
  @Public()
  openapi(): unknown {
    return documentOpenApi(routes, '0.1.0');
  }
}
