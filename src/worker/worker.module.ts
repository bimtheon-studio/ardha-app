// Point d'entrée worker : consomme les files BullMQ. Seul à sortir vers l'extérieur (API
// publiques, PDF, LLM) dans les lots suivants (PLAN §3).
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { DbModule } from '../db/db.module.ts';
import { AccountsModule } from '../accounts/accounts.module.ts';
import { type Config, CONFIG } from '../config/config.ts';
import { ConfigModule } from '../config/config.module.ts';
import { loggingOptions } from '../shared/logs.ts';
import { MAINTENANCE_QUEUE, MaintenanceProcessor, MaintenanceScheduler } from './maintenance.ts';

export function redisConnection(url: string) {
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
  static forConfig(config?: Config) {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forConfig(config),
        LoggerModule.forRootAsync({ inject: [CONFIG], useFactory: loggingOptions }),
        DbModule,
        AccountsModule,
        BullModule.forRootAsync({
          inject: [CONFIG],
          useFactory: (c: Config) => ({ connection: redisConnection(c.REDIS_URL), prefix: 'ardha:bull' }),
        }),
        BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
      ],
      providers: [MaintenanceProcessor, MaintenanceScheduler],
    };
  }
}
