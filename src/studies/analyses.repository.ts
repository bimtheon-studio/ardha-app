// Analyses des études (PLAN §4) : une ligne par étude et par type. L'état du travail vit ici, pas
// dans Redis : la réconciliation relance ce qui s'est perdu.
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt, or, sql } from 'drizzle-orm';

import type { RisksResult } from '../contracts/index.ts';
import { DB, type Db } from '../db/db.ts';
import { studyAnalysis, type StudyAnalysisRow } from '../db/schema.ts';

export type AnalysisKind = StudyAnalysisRow['kind'];

@Injectable()
export class AnalysesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async get(studyId: string, kind: AnalysisKind): Promise<StudyAnalysisRow | undefined> {
    const [r] = await this.db.select().from(studyAnalysis).where(and(eq(studyAnalysis.studyId, studyId), eq(studyAnalysis.kind, kind)));
    return r;
  }

  /**
   * Demande l'analyse pour une empreinte : rend `queued: false` si elle est déjà à jour ou en cours
   * pour cette empreinte (sauf `force`). Le résultat précédent reste visible pendant le calcul.
   */
  async request(studyId: string, kind: AnalysisKind, parcelsKey: string, now: Date, force: boolean): Promise<{ row: StudyAnalysisRow; queued: boolean }> {
    const current = await this.get(studyId, kind);
    if (current && current.parcelsKey === parcelsKey && !force && current.status !== 'failed') return { row: current, queued: false };
    const [row] = await this.db
      .insert(studyAnalysis)
      .values({ studyId, kind, status: 'queued', parcelsKey, requestedAt: now })
      .onConflictDoUpdate({
        target: [studyAnalysis.studyId, studyAnalysis.kind],
        set: { status: 'queued', parcelsKey, requestedAt: now, startedAt: null, error: null, attempts: 0 },
      })
      .returning();
    return { row: row!, queued: true };
  }

  /** Passe en cours si l'analyse attend toujours cette empreinte ; faux sinon (demande plus récente). */
  async markRunning(studyId: string, kind: AnalysisKind, parcelsKey: string, now: Date): Promise<boolean> {
    const r = await this.db
      .update(studyAnalysis)
      .set({ status: 'running', startedAt: now, attempts: sql`${studyAnalysis.attempts} + 1` })
      .where(and(eq(studyAnalysis.studyId, studyId), eq(studyAnalysis.kind, kind), eq(studyAnalysis.parcelsKey, parcelsKey)))
      .returning({ id: studyAnalysis.id });
    return r.length > 0;
  }

  async markReady(studyId: string, kind: AnalysisKind, parcelsKey: string, result: RisksResult, now: Date): Promise<boolean> {
    const r = await this.db
      .update(studyAnalysis)
      .set({ status: 'ready', result, error: null, computedAt: now })
      .where(and(eq(studyAnalysis.studyId, studyId), eq(studyAnalysis.kind, kind), eq(studyAnalysis.parcelsKey, parcelsKey)))
      .returning({ id: studyAnalysis.id });
    return r.length > 0;
  }

  async markFailed(studyId: string, kind: AnalysisKind, parcelsKey: string, error: string): Promise<void> {
    await this.db
      .update(studyAnalysis)
      .set({ status: 'failed', error })
      .where(and(eq(studyAnalysis.studyId, studyId), eq(studyAnalysis.kind, kind), eq(studyAnalysis.parcelsKey, parcelsKey)));
  }

  /** En file depuis avant `queuedBefore`, ou en cours depuis avant `runningBefore` : leur job s'est perdu. */
  async stalled(queuedBefore: Date, runningBefore: Date): Promise<Pick<StudyAnalysisRow, 'studyId' | 'kind' | 'parcelsKey'>[]> {
    return this.db
      .select({ studyId: studyAnalysis.studyId, kind: studyAnalysis.kind, parcelsKey: studyAnalysis.parcelsKey })
      .from(studyAnalysis)
      .where(
        or(
          and(eq(studyAnalysis.status, 'queued'), lt(studyAnalysis.requestedAt, queuedBefore)),
          and(eq(studyAnalysis.status, 'running'), lt(studyAnalysis.startedAt, runningBefore)),
        ),
      )
      .limit(100);
  }

  /** États des analyses d'une étude (ses étapes). */
  async statuses(studyId: string): Promise<Pick<StudyAnalysisRow, 'kind' | 'status' | 'parcelsKey'>[]> {
    return this.db
      .select({ kind: studyAnalysis.kind, status: studyAnalysis.status, parcelsKey: studyAnalysis.parcelsKey })
      .from(studyAnalysis)
      .where(eq(studyAnalysis.studyId, studyId));
  }
}
