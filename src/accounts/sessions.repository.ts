import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lte, or } from 'drizzle-orm';

import { DB, type Db } from '../db/db.ts';
import { type SessionRow, type UserRow, session, user } from '../db/schema.ts';

export type NewSession = Pick<
  SessionRow,
  'userId' | 'tokenHash' | 'expiresAt' | 'absoluteExpiresAt' | 'ip' | 'userAgent' | 'createdAt' | 'lastActivityAt'
>;

@Injectable()
export class SessionsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(newSession: NewSession): Promise<SessionRow> {
    const [s] = await this.db.insert(session).values(newSession).returning();
    return s!;
  }

  async byTokenHash(tokenHash: string): Promise<{ session: SessionRow; user: UserRow } | undefined> {
    const [line] = await this.db
      .select({ session, user })
      .from(session)
      .innerJoin(user, eq(user.id, session.userId))
      .where(eq(session.tokenHash, tokenHash));
    return line;
  }

  async renew(id: string, expiresAt: Date, now: Date): Promise<void> {
    await this.db.update(session).set({ expiresAt, lastActivityAt: now }).where(eq(session.id, id));
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(session).where(eq(session.id, id));
  }

  /** Ferme toutes les sessions d'un utilisateur ; rend leur nombre. */
  async removeForUser(userId: string): Promise<number> {
    const r = await this.db.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
    return r.length;
  }

  async purgeExpired(now: Date): Promise<number> {
    const r = await this.db
      .delete(session)
      .where(or(lte(session.expiresAt, now), lte(session.absoluteExpiresAt, now)))
      .returning({ id: session.id });
    return r.length;
  }

  /** Pour les tests et la CLI : sessions d'un utilisateur. */
  forUser(userId: string): Promise<SessionRow[]> {
    return this.db.select().from(session).where(and(eq(session.userId, userId)));
  }
}
