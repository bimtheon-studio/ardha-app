// File « lookups » : recherches à la demande, attendues par l'API. Débit limité en dessous de la
// limite de la Géoplateforme (50 requêtes/s par IP) ; un job trop vieux n'est plus attendu : ignoré.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { LOOKUP_EXPIRY_MS, type LookupName } from '../geo/lookups.ts';
import { LookupHandlers } from '../ingestion/lookup-handlers.ts';
import { Clock } from '../shared/clock.ts';
import { LOOKUPS_QUEUE } from '../shared/queues.ts';

@Processor(LOOKUPS_QUEUE, { concurrency: 8, limiter: { max: 40, duration: 1_000 } })
export class LookupsProcessor extends WorkerHost {
  constructor(
    private readonly handlers: LookupHandlers,
    private readonly clock: Clock,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (this.clock.now().getTime() - job.timestamp > LOOKUP_EXPIRY_MS) return null;
    return this.handlers.handle(job.name as LookupName, job.data as never);
  }
}
