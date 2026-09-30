import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';

import { DB, type Db } from '../db/db.ts';
import { type PasswordResetRow, passwordReset as resets } from '../db/schema.ts';

@Injectable()
export class PasswordResetsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(userId: string, tokenHash: string, createdAt: Date, expiresAt: Date): Promise<PasswordResetRow> {
    const [r] = await this.db.insert(resets).values({ userId, tokenHash, createdAt, expiresAt }).returning();
    return r!;
  }

  async byTokenHash(tokenHash: string): Promise<PasswordResetRow | undefined> {
    const [r] = await this.db.select().from(resets).where(eq(resets.tokenHash, tokenHash));
    return r;
  }

  /**
   * Consomme un lien encore valable, en une seule requête : deux utilisations simultanées du même
   * lien ne peuvent pas réussir toutes les deux.
   */
  async consume(tokenHash: string, now: Date): Promise<PasswordResetRow | undefined> {
    const [r] = await this.db
      .update(resets)
      .set({ usedAt: now })
      .where(and(eq(resets.tokenHash, tokenHash), isNull(resets.usedAt), gt(resets.expiresAt, now)))
      .returning();
    return r;
  }

  /** Invalide les liens encore ouverts d'un utilisateur (un nouveau lien remplace l'ancien). */
  async cancelOpen(userId: string, now: Date): Promise<void> {
    await this.db
      .update(resets)
      .set({ usedAt: now })
      .where(and(eq(resets.userId, userId), isNull(resets.usedAt)));
  }

  async purge(now: Date): Promise<number> {
    const r = await this.db
      .delete(resets)
      .where(or(lte(resets.expiresAt, now), isNotNull(resets.usedAt)))
      .returning({ id: resets.id });
    return r.length;
  }
}
