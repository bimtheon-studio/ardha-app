// Santé de l'API (pour le déploiement et la surveillance) et document OpenAPI dérivé du contrat.
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { documentOpenApi, routes, type Sante } from '../../contrats/index.ts';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import type pg from 'pg';

import { POOL } from '../../base/base.ts';
import { Publique } from './http/session.guard.ts';
import { REDIS } from '../../commun/redis.ts';

@Controller('api')
export class SystemeController {
  constructor(
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('health')
  @Publique()
  async sante(@Res({ passthrough: true }) reponse: Response): Promise<Sante> {
    const [base, redis] = await Promise.all([
      this.pool.query('SELECT 1').then(() => 'ok' as const, () => 'injoignable' as const),
      this.redis.ping().then(() => 'ok' as const, () => 'injoignable' as const),
    ]);
    const statut = base === 'ok' && redis === 'ok' ? 'ok' : 'degrade';
    if (statut !== 'ok') reponse.status(503);
    return { statut, base, redis };
  }

  @Get('openapi.json')
  @Publique()
  openapi(): unknown {
    return documentOpenApi(routes, '0.1.0');
  }
}
