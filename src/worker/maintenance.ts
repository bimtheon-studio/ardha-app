// File « maintenance » (entrée worker) : purge quotidienne des sessions expirées et des liens de réinitialisation
// périmés. Le worker planifie la tâche au démarrage (idempotent) et la consomme.
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { AccountsPurge } from '../accounts/purge.service.ts';

export const MAINTENANCE_QUEUE = 'maintenance';
export const PURGE_JOB = 'accounts:purge';

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger('Maintenance');

  constructor(private readonly purge: AccountsPurge) {
    super();
  }

  async process(job: Job): Promise<{ sessions: number; links: number }> {
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
  }
}
