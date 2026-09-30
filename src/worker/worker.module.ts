// Point d'entrée worker : consomme les files BullMQ. Seul à sortir vers l'extérieur (API
// publiques, PDF, LLM) : PLAN §3.
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AccountsModule } from '../accounts/accounts.module.ts';
import { type Config, CONFIG } from '../config/config.ts';
import { ConfigModule } from '../config/config.module.ts';
import { DbModule } from '../db/db.module.ts';
import { GeoModule } from '../geo/geo.module.ts';
import { IngestionModule } from '../ingestion/ingestion.module.ts';
import { loggingOptions } from '../shared/logs.ts';
import { MAINTENANCE_QUEUE, QueuesModule } from '../shared/queues.ts';
import { RedisModule } from '../shared/redis.ts';
import { CadastreProcessor } from './cadastre.processor.ts';
import { LookupsProcessor } from './lookups.processor.ts';
import { MaintenanceProcessor, MaintenanceScheduler, Reconciliation } from './maintenance.ts';

@Module({})
export class WorkerModule {
  static forConfig(config?: Config) {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forConfig(config),
        LoggerModule.forRootAsync({ inject: [CONFIG], useFactory: loggingOptions }),
        DbModule,
        RedisModule,
        QueuesModule.forRoot(),
        AccountsModule,
        GeoModule,
        IngestionModule,
        BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
      ],
      providers: [MaintenanceProcessor, MaintenanceScheduler, Reconciliation, CadastreProcessor, LookupsProcessor],
    };
  }
}
