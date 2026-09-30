// File « maintenance » (entrée worker) : purge quotidienne des sessions expirées et des liens de
// réinitialisation périmés ; réconciliation des chargements toutes les 5 minutes (réenfile ce que
// Redis a perdu, d'après `source_states`). Le worker planifie les tâches au démarrage (idempotent).
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { AccountsPurge } from '../accounts/purge.service.ts';
import { CADASTRE_SOURCE, CadastreService } from '../geo/cadastre.service.ts';
import { SourceStatesRepository } from '../geo/source-states.repository.ts';
import { Clock } from '../shared/clock.ts';
import { MAINTENANCE_QUEUE } from '../shared/queues.ts';

export const PURGE_JOB = 'accounts:purge';
export const RECONCILE_JOB = 'cadastre:reconcile';
/** Un job en file depuis plus longtemps s'est sans doute perdu ; un chargement muet depuis 15 min a planté. */
const QUEUED_GRACE_MS = 2 * 60_000;
const LOADING_GRACE_MS = 15 * 60_000;

@Injectable()
export class Reconciliation {
  constructor(
    private readonly states: SourceStatesRepository,
    private readonly cadastre: CadastreService,
    private readonly clock: Clock,
  ) {}

  /** Réenfile les chargements perdus ; rend les communes concernées. */
  async run(): Promise<string[]> {
    const now = this.clock.now().getTime();
    const stalled = await this.states.stalled(CADASTRE_SOURCE, new Date(now - QUEUED_GRACE_MS), new Date(now - LOADING_GRACE_MS));
    for (const s of stalled) await this.cadastre.enqueue(s.scope);
    return stalled.map((s) => s.scope);
  }
}

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger('Maintenance');

  constructor(
    private readonly purge: AccountsPurge,
    private readonly reconciliation: Reconciliation,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === RECONCILE_JOB) {
      const communes = await this.reconciliation.run();
      if (communes.length > 0) this.logger.log(`Réconciliation : ${communes.join(', ')} réenfilée(s)`);
      return communes;
    }
    if (job.name !== PURGE_JOB) throw new Error(`Tâche inconnue : ${job.name}`);
    const result = await this.purge.purge();
    this.logger.log(`Purge : ${result.sessions} session(s), ${result.links} lien(s)`);
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
    await this.file.upsertJobScheduler(
      'cadastre-reconcile',
      { every: 5 * 60_000 },
      { name: RECONCILE_JOB, opts: { removeOnComplete: 10, removeOnFail: 100 } },
    );
  }
}
