// File « maintenance » (entrée worker) : purge quotidienne des sessions expirées et des liens de réinitialisation
// périmés. Le worker planifie la tâche au démarrage (idempotent) et la consomme.
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { PurgeComptes } from '../../comptes/purge.service.ts';

export const FILE_MAINTENANCE = 'maintenance';
export const TACHE_PURGE = 'comptes:purger';

@Processor(FILE_MAINTENANCE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger('Maintenance');

  constructor(private readonly purge: PurgeComptes) {
    super();
  }

  async process(tache: Job): Promise<{ sessions: number; liens: number }> {
    if (tache.name !== TACHE_PURGE) throw new Error(`Tâche inconnue : ${tache.name}`);
    const bilan = await this.purge.purger();
    this.logger.log(`Purge : ${bilan.sessions} session(s), ${bilan.liens} lien(s)`);
    return bilan;
  }
}

@Injectable()
export class PlanificationMaintenance implements OnApplicationBootstrap {
  constructor(@InjectQueue(FILE_MAINTENANCE) private readonly file: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.file.upsertJobScheduler(
      'purge-quotidienne',
      { pattern: '0 4 * * *', tz: 'Europe/Paris' },
      { name: TACHE_PURGE, opts: { removeOnComplete: 30, removeOnFail: 100 } },
    );
  }
}
