// File « cadastre » : chargement d'une commune, une ou deux à la fois (un fichier pèse jusqu'à
// quelques Mo). Trois tentatives espacées ; l'état vit dans `source_states`.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { type Job, UnrecoverableError } from 'bullmq';

import { LOAD_COMMUNE_JOB, type LoadCommuneJob } from '../geo/cadastre.service.ts';
import { CadastreLoader, type LoadResult, PermanentLoadError } from '../ingestion/cadastre-loader.ts';
import { CADASTRE_QUEUE } from '../shared/queues.ts';

@Processor(CADASTRE_QUEUE, { concurrency: 2 })
export class CadastreProcessor extends WorkerHost {
  constructor(private readonly loader: CadastreLoader) {
    super();
  }

  async process(job: Job<LoadCommuneJob>): Promise<LoadResult> {
    if (job.name !== LOAD_COMMUNE_JOB) throw new Error(`Tâche inconnue : ${job.name}`);
    const attempts = job.opts.attempts ?? 1;
    try {
      return await this.loader.load(job.data.code, job.attemptsMade + 1 < attempts);
    } catch (error) {
      // Inutile de réessayer une commune inconnue : BullMQ n'insiste pas.
      if (error instanceof PermanentLoadError) throw new UnrecoverableError(error.message);
      throw error;
    }
  }
}
