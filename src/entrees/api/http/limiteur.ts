// Limitation des tentatives (F-00, Q7) avec le module officiel `@nestjs/throttler` : 5 tentatives
// en 15 minutes par adresse IP et par adresse e-mail, puis 15 minutes d'attente. Les compteurs
// vivent dans Redis, pour tenir sur plusieurs instances de l'API et survivre à un redémarrage.
import { HttpException, Injectable } from '@nestjs/common';
import { type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerOptions, type ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface.js';
import { normaliserEmail } from '../../../domaine/index.ts';
import type { Redis } from 'ioredis';

export const QUINZE_MINUTES_MS = 15 * 60 * 1000;
export const TENTATIVES_MAX = 5;

/** Clé de limitation par e-mail : l'adresse du corps de la requête, normalisée. */
function emailDuCorps(requete: Record<string, unknown>): string {
  const corps = requete.body as { email?: unknown } | undefined;
  return typeof corps?.email === 'string' ? normaliserEmail(corps.email) : 'sans-email';
}

export const LIMITES: ThrottlerOptions[] = [
  { name: 'ip', ttl: QUINZE_MINUTES_MS, limit: TENTATIVES_MAX, blockDuration: QUINZE_MINUTES_MS },
  {
    name: 'email',
    ttl: QUINZE_MINUTES_MS,
    limit: TENTATIVES_MAX,
    blockDuration: QUINZE_MINUTES_MS,
    getTracker: (requete) => emailDuCorps(requete),
  },
];

/**
 * Stockage Redis des compteurs. Fenêtre fixe : le compteur naît à la première tentative et expire
 * `ttl` plus tard ; au-delà de la limite, une clé de blocage dure `blockDuration`.
 */
export class StockageRedisLimites implements ThrottlerStorage {
  constructor(
    private readonly redis: Redis,
    private readonly prefixe = 'ardha:limite',
  ) {}

  async increment(cle: string, ttl: number, limite: number, blocage: number, nom: string): Promise<ThrottlerStorageRecord> {
    const k = `${this.prefixe}:${nom}:${cle}`;
    const kBlocage = `${k}:bloque`;
    const restant = await this.redis.pttl(kBlocage);
    if (restant > 0) {
      const s = Math.ceil(restant / 1000);
      return { totalHits: limite + 1, timeToExpire: s, isBlocked: true, timeToBlockExpire: s };
    }
    const r = await this.redis.multi().incr(k).pexpire(k, ttl, 'NX').pttl(k).exec();
    const coups = Number(r?.[0]?.[1] ?? 1);
    const expire = Math.ceil(Number(r?.[2]?.[1] ?? ttl) / 1000);
    if (coups > limite) {
      await this.redis.set(kBlocage, '1', 'PX', blocage);
      await this.redis.del(k);
      const s = Math.ceil(blocage / 1000);
      return { totalHits: coups, timeToExpire: s, isBlocked: true, timeToBlockExpire: s };
    }
    return { totalHits: coups, timeToExpire: expire, isBlocked: false, timeToBlockExpire: 0 };
  }
}

/** Garde du throttler, avec un message en français qui dit combien de temps attendre. */
@Injectable()
export class Limiteur extends ThrottlerGuard {
  protected override async throwThrottlingException(_ctx: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const minutes = Math.max(1, Math.ceil(detail.timeToBlockExpire / 60));
    throw new HttpException(
      { messageFr: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.` },
      429,
    );
  }
}
