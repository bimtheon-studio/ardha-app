// File « maintenance » (entrée worker) : purge quotidienne des sessions expirées, des liens de
// réinitialisation périmés et des études restées 30 jours dans la corbeille ; réconciliation toutes
// les 5 minutes (réenfile ce que Redis a perdu, d'après `source_states` et les empreintes des
// études). Le worker planifie les tâches au démarrage (idempotent).
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { AccountsPurge } from '../accounts/purge.service.ts';
import { CADASTRE_SOURCE, CadastreService } from '../geo/cadastre.service.ts';
import { SourceStatesRepository } from '../geo/source-states.repository.ts';
import { Clock } from '../shared/clock.ts';
import { MAINTENANCE_QUEUE } from '../shared/queues.ts';
import { AnalysesRepository } from '../studies/analyses.repository.ts';
import { ANALYZE_RISKS_JOB, StudyJobs } from '../studies/studies.jobs.ts';
import { StudiesRepository } from '../studies/studies.repository.ts';
import { StudiesService } from '../studies/studies.service.ts';

export const PURGE_JOB = 'accounts:purge';
export const RECONCILE_JOB = 'cadastre:reconcile';
/** Un job en file depuis plus longtemps s'est sans doute perdu ; un chargement muet depuis 15 min a planté. */
const QUEUED_GRACE_MS = 2 * 60_000;
const LOADING_GRACE_MS = 15 * 60_000;
/** Une étude dont l'adresse ou la vignette attend depuis plus d'une minute a perdu son job. */
const STUDY_GRACE_MS = 60_000;

@Injectable()
export class Reconciliation {
  constructor(
    private readonly states: SourceStatesRepository,
    private readonly cadastre: CadastreService,
    private readonly studies: StudiesRepository,
    private readonly studyJobs: StudyJobs,
    private readonly analyses: AnalysesRepository,
    private readonly clock: Clock,
  ) {}

  /** Réenfile les chargements et les calculs d'étude perdus ; rend les communes et études concernées. */
  async run(): Promise<{ communes: string[]; studies: string[]; analyses: string[] }> {
    const now = this.clock.now().getTime();
    const stalled = await this.states.stalled(CADASTRE_SOURCE, new Date(now - QUEUED_GRACE_MS), new Date(now - LOADING_GRACE_MS));
    for (const s of stalled) await this.cadastre.enqueue(s.scope);
    // Un job déjà en file ou en cours a le même jobId : le réenfiler est sans effet.
    const lagging = await this.studies.lagging(new Date(now - STUDY_GRACE_MS));
    for (const s of lagging) await this.studyJobs.enqueue({ studyId: s.id, parcelsKey: s.parcelsKey });
    const analyses = await this.analyses.stalled(new Date(now - QUEUED_GRACE_MS), new Date(now - LOADING_GRACE_MS));
    for (const a of analyses) await this.studyJobs.enqueue({ studyId: a.studyId, parcelsKey: a.parcelsKey }, [ANALYZE_RISKS_JOB]);
    return { communes: stalled.map((s) => s.scope), studies: lagging.map((s) => s.id), analyses: analyses.map((a) => a.studyId) };
  }
}

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger('Maintenance');

  constructor(
    private readonly purge: AccountsPurge,
    private readonly studies: StudiesService,
    private readonly reconciliation: Reconciliation,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === RECONCILE_JOB) {
      const r = await this.reconciliation.run();
      if (r.communes.length > 0) this.logger.log(`Réconciliation : commune(s) ${r.communes.join(', ')} réenfilée(s)`);
      if (r.studies.length > 0) this.logger.log(`Réconciliation : ${r.studies.length} étude(s) réenfilée(s)`);
      if (r.analyses.length > 0) this.logger.log(`Réconciliation : ${r.analyses.length} analyse(s) réenfilée(s)`);
      return r;
    }
    if (job.name !== PURGE_JOB) throw new Error(`Tâche inconnue : ${job.name}`);
    const result = { ...(await this.purge.purge()), studies: (await this.studies.purge('worker')).length };
    this.logger.log(`Purge : ${result.sessions} session(s), ${result.links} lien(s), ${result.studies} étude(s)`);
    return result;
  }
}

@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly file: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.file.upsertJobScheduler(
      'daily-purge',
      { pattern: '0 4 * * *', tz: 'Europe/Paris' },
      { name: PURGE_JOB, opts: { removeOnComplete: 30, removeOnFail: 100 } },
    );
    // Nom gardé : le planificateur existe déjà sous ce nom dans les environnements en place.
    await this.file.upsertJobScheduler(
      'cadastre-reconcile',
      { every: 5 * 60_000 },
      { name: RECONCILE_JOB, opts: { removeOnComplete: 10, removeOnFail: 100 } },
    );
  }
}
