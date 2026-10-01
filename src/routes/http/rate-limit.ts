// Limitation des tentatives (F-00, Q7) avec le module officiel `@nestjs/throttler` : 5 tentatives
// en 15 minutes par adresse IP et par adresse e-mail, puis 15 minutes d'attente. Les compteurs
// vivent dans Redis, pour tenir sur plusieurs instances de l'API et survivre à un redémarrage.
import { HttpException, Injectable } from '@nestjs/common';
import { type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerOptions, type ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface.js';
import { normalizeEmail } from '../../domain/index.ts';
import type { Redis } from 'ioredis';

import type { Config } from '../../config/config.ts';

export const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

/** Clé de limitation par e-mail : l'adresse du corps de la requête, normalisée. */
function emailFromBody(request: Record<string, unknown>): string {
  const body = request.body as { email?: unknown } | undefined;
  return typeof body?.email === 'string' ? normalizeEmail(body.email) : 'no-email';
}

export const LIMITS: ThrottlerOptions[] = [
  { name: 'ip', ttl: FIFTEEN_MINUTES_MS, limit: MAX_ATTEMPTS, blockDuration: FIFTEEN_MINUTES_MS },
  {
    name: 'email',
    ttl: FIFTEEN_MINUTES_MS,
    limit: MAX_ATTEMPTS,
    blockDuration: FIFTEEN_MINUTES_MS,
    getTracker: (request) => emailFromBody(request),
  },
];

/**
 * Préfixe des compteurs : celui de l'environnement (plusieurs partagent un Redis, D-13), puis le nom
 * du cookie (unique par worktree et par test).
 */
export function rateLimitPrefix(c: Pick<Config, 'REDIS_PREFIX' | 'SESSION_COOKIE_NAME'>): string {
  return `${c.REDIS_PREFIX}:${c.SESSION_COOKIE_NAME}:rate-limit`;
}

/**
 * Stockage Redis des compteurs. Fenêtre fixe : le compteur naît à la première tentative et expire
 * `ttl` plus tard ; au-delà de la limite, une clé de blocage dure `blockDuration`.
 */
export class RedisRateLimitStorage implements ThrottlerStorage {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {}

  async increment(key: string, ttl: number, limit: number, blockMs: number, name: string): Promise<ThrottlerStorageRecord> {
    const k = `${this.prefix}:${name}:${key}`;
    const blockKey = `${k}:bloque`;
    const remainingMs = await this.redis.pttl(blockKey);
    if (remainingMs > 0) {
      const s = Math.ceil(remainingMs / 1000);
      return { totalHits: limit + 1, timeToExpire: s, isBlocked: true, timeToBlockExpire: s };
    }
    const r = await this.redis.multi().incr(k).pexpire(k, ttl, 'NX').pttl(k).exec();
    const hits = Number(r?.[0]?.[1] ?? 1);
    const expiresSec = Math.ceil(Number(r?.[2]?.[1] ?? ttl) / 1000);
    if (hits > limit) {
      await this.redis.set(blockKey, '1', 'PX', blockMs);
      await this.redis.del(k);
      const s = Math.ceil(blockMs / 1000);
      return { totalHits: hits, timeToExpire: s, isBlocked: true, timeToBlockExpire: s };
    }
    return { totalHits: hits, timeToExpire: expiresSec, isBlocked: false, timeToBlockExpire: 0 };
  }
}

/** Garde du throttler, avec un message en français qui dit combien de temps attendre. */
@Injectable()
export class RateLimiter extends ThrottlerGuard {
  protected override async throwThrottlingException(_ctx: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const minutes = Math.max(1, Math.ceil(detail.timeToBlockExpire / 60));
    throw new HttpException(
      { userMessage: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.` },
      429,
    );
  }
}
