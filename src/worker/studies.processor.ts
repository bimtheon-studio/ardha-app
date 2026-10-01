// File « studies » : adresse et vignette des études (F-02), analyse des risques (F-04). Quelques
// études à la fois : un job fait au plus une centaine d'appels aux sources.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { RiskAnalyses, type RiskRunResult } from '../ingestion/risk-analyses.ts';
import { type DerivationResult, StudyDerivations } from '../ingestion/study-derivations.ts';
import { ANALYZE_RISKS_JOB, RENDER_THUMBNAIL_JOB, RESOLVE_ADDRESS_JOB, type StudyJob } from '../studies/studies.jobs.ts';
import { STUDIES_QUEUE } from '../shared/queues.ts';

@Processor(STUDIES_QUEUE, { concurrency: 4 })
export class StudiesProcessor extends WorkerHost {
  constructor(
    private readonly derivations: StudyDerivations,
    private readonly risks: RiskAnalyses,
  ) {
    super();
  }

  async process(job: Job<StudyJob>): Promise<DerivationResult | RiskRunResult> {
    if (job.name === ANALYZE_RISKS_JOB) return this.risks.run(job.data, job.attemptsMade + 1 >= (job.opts.attempts ?? 1));
    if (job.name === RESOLVE_ADDRESS_JOB) return this.derivations.resolveAddress(job.data);
    if (job.name === RENDER_THUMBNAIL_JOB) return this.derivations.renderThumbnail(job.data);
    throw new Error(`Tâche inconnue : ${job.name}`);
  }
}
