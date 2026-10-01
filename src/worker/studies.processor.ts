// File « studies » : adresse et vignette des études (F-02). Quelques études à la fois : chaque job
// fait au plus 12 appels à la BAN, ou une dizaine de tuiles.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { type DerivationResult, StudyDerivations } from '../ingestion/study-derivations.ts';
import { RENDER_THUMBNAIL_JOB, RESOLVE_ADDRESS_JOB, type StudyJob } from '../studies/studies.jobs.ts';
import { STUDIES_QUEUE } from '../shared/queues.ts';

@Processor(STUDIES_QUEUE, { concurrency: 4 })
export class StudiesProcessor extends WorkerHost {
  constructor(private readonly derivations: StudyDerivations) {
    super();
  }

  async process(job: Job<StudyJob>): Promise<DerivationResult> {
    if (job.name === RESOLVE_ADDRESS_JOB) return this.derivations.resolveAddress(job.data);
    if (job.name === RENDER_THUMBNAIL_JOB) return this.derivations.renderThumbnail(job.data);
    throw new Error(`Tâche inconnue : ${job.name}`);
  }
}
