// Études (F-02) : données client, partagées par l'API, le worker et la CLI ; ne sort jamais.
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditLog } from '../audit/audit-log.ts';
import { GeoModule } from '../geo/geo.module.ts';
import { STUDIES_QUEUE } from '../shared/queues.ts';
import { AnalysesRepository } from './analyses.repository.ts';
import { RisksService } from './risks.service.ts';
import { StudyJobs } from './studies.jobs.ts';
import { StudiesRepository } from './studies.repository.ts';
import { StudiesService } from './studies.service.ts';

const providers = [StudiesRepository, StudiesService, AnalysesRepository, RisksService, StudyJobs, AuditLog];
const queues = BullModule.registerQueue({ name: STUDIES_QUEUE });

@Module({ imports: [GeoModule, queues], providers, exports: [...providers, queues] })
export class StudiesModule {}
