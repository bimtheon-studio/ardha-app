// État des sources de référence par périmètre (PLAN §4, « etat_source ») : ce que le worker a
// chargé, et ce qui reste à faire. La réconciliation relit cette table pour réenfiler ce qui s'est
// perdu dans Redis.
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';

import { DB, type Db } from '../db/db.ts';
import { sourceState, type SourceStateRow } from '../db/schema.ts';

@Injectable()
export class SourceStatesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async get(source: string, scope: string): Promise<SourceStateRow | undefined> {
    const [r] = await this.db
      .select()
      .from(sourceState)
      .where(and(eq(sourceState.source, source), eq(sourceState.scope, scope)));
    return r;
  }

  /**
   * Demande un chargement : crée l'état `queued`, ou y remet un état `failed` (ou `ready` si
   * `force`). Sans effet sur un chargement déjà en file ou en cours. Rend l'état obtenu.
   */
  async request(source: string, scope: string, now: Date, force = false): Promise<SourceStateRow> {
    const reopen = force ? ['failed', 'ready'] : ['failed'];
    const [r] = await this.db
      .insert(sourceState)
      .values({ source, scope, status: 'queued', requestedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [sourceState.source, sourceState.scope],
        set: { status: 'queued', requestedAt: now, error: null, attempts: 0, updatedAt: now },
        setWhere: sql`${sourceState.status} IN (${sql.join(reopen.map((s) => sql`${s}`), sql`, `)})`,
      })
      .returning();
    return r ?? (await this.get(source, scope))!;
  }

  async markLoading(source: string, scope: string, now: Date): Promise<void> {
    await this.db
      .insert(sourceState)
      .values({ source, scope, status: 'loading', requestedAt: now, startedAt: now, attempts: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: [sourceState.source, sourceState.scope],
        set: { status: 'loading', startedAt: now, attempts: sql`${sourceState.attempts} + 1`, updatedAt: now },
      });
  }

  async markReady(source: string, scope: string, version: string, itemCount: number, now: Date): Promise<void> {
    await this.db
      .update(sourceState)
      .set({ status: 'ready', version, itemCount, loadedAt: now, error: null, updatedAt: now })
      .where(and(eq(sourceState.source, source), eq(sourceState.scope, scope)));
  }

  /** `retrying` : le worker va réessayer ; l'état reste `loading`, avec le message de l'échec. */
  async markFailed(source: string, scope: string, error: string, now: Date, retrying: boolean): Promise<void> {
    await this.db
      .update(sourceState)
      .set({ status: retrying ? 'loading' : 'failed', error, updatedAt: now })
      .where(and(eq(sourceState.source, source), eq(sourceState.scope, scope)));
  }

  /** En file depuis `queuedBefore`, ou en cours depuis `loadingBefore` : à réenfiler. */
  async stalled(source: string, queuedBefore: Date, loadingBefore: Date): Promise<SourceStateRow[]> {
    return this.db
      .select()
      .from(sourceState)
      .where(
        and(
          eq(sourceState.source, source),
          or(
            and(eq(sourceState.status, 'queued'), lt(sourceState.requestedAt, queuedBefore)),
            and(eq(sourceState.status, 'loading'), lt(sourceState.updatedAt, loadingBefore)),
          ),
        ),
      )
      .orderBy(asc(sourceState.requestedAt));
  }

  async list(source: string, scopes?: readonly string[]): Promise<SourceStateRow[]> {
    return this.db
      .select()
      .from(sourceState)
      .where(and(eq(sourceState.source, source), scopes ? inArray(sourceState.scope, [...scopes]) : undefined))
      .orderBy(asc(sourceState.scope));
  }
}
