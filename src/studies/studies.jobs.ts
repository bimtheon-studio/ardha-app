// Calculs du worker pour une étude (F-02) : adresse et vignette, pour une empreinte de parcelles. Un
// jobId par empreinte : de nouvelles parcelles donnent un nouveau job, un doublon est ignoré.
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { STUDIES_QUEUE } from '../shared/queues.ts';

export const RESOLVE_ADDRESS_JOB = 'study:resolve-address';
export const RENDER_THUMBNAIL_JOB = 'study:render-thumbnail';
/** Analyse des risques (F-04), à la demande. */
export const ANALYZE_RISKS_JOB = 'study:analyze-risks';
export type StudyJobName = typeof RESOLVE_ADDRESS_JOB | typeof RENDER_THUMBNAIL_JOB | typeof ANALYZE_RISKS_JOB;

export interface StudyJob {
  studyId: string;
  parcelsKey: string;
  /** Recalcule même si le résultat est à jour (CLI). */
  force?: boolean;
}

export function studyJobId(name: StudyJobName, job: StudyJob, now = Date.now()): string {
  const id = `${name.replace(':', '-')}-${job.studyId}-${job.parcelsKey}`;
  return job.force ? `${id}-forced-${now}` : id;
}

@Injectable()
export class StudyJobs {
  constructor(@InjectQueue(STUDIES_QUEUE) private readonly queue: Queue) {}

  async enqueue(job: StudyJob, names: readonly StudyJobName[] = [RESOLVE_ADDRESS_JOB, RENDER_THUMBNAIL_JOB]): Promise<void> {
    await this.queue.addBulk(
      names.map((name) => ({
        name,
        data: job,
        opts: {
          jobId: studyJobId(name, job),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: { age: 24 * 3600 },
        },
      })),
    );
  }
}
