// Point d'entrée worker : consomme les files BullMQ. Seul à sortir vers l'extérieur (API
// publiques, PDF, LLM) dans les lots suivants (PLAN §3).
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { BaseModule } from '../../base/base.module.ts';
import { ComptesModule } from '../../comptes/comptes.module.ts';
import { type Config, CONFIG } from '../../config/config.ts';
import { ConfigModule } from '../../config/config.module.ts';
import { optionsJournalisation } from '../../commun/logs.ts';
import { FILE_MAINTENANCE, MaintenanceProcessor, PlanificationMaintenance } from './maintenance.ts';

export function connexionRedis(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    db: Number(u.pathname.slice(1) || 0),
    ...(u.username && { username: decodeURIComponent(u.username) }),
    ...(u.password && { password: decodeURIComponent(u.password) }),
    ...(u.protocol === 'rediss:' && { tls: {} }),
    // Exigé par BullMQ pour ses connexions bloquantes.
    maxRetriesPerRequest: null,
  };
}

@Module({})
export class WorkerModule {
  static pour(config?: Config) {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.pour(config),
        LoggerModule.forRootAsync({ inject: [CONFIG], useFactory: optionsJournalisation }),
        BaseModule,
        ComptesModule,
        BullModule.forRootAsync({
          inject: [CONFIG],
          useFactory: (c: Config) => ({ connection: connexionRedis(c.REDIS_URL), prefix: 'ardha:bull' }),
        }),
        BullModule.registerQueue({ name: FILE_MAINTENANCE }),
      ],
      providers: [MaintenanceProcessor, PlanificationMaintenance],
    };
  }
}
