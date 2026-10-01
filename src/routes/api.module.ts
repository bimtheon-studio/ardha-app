// Point d'entrée API : REST pour le front. Ne sort jamais vers l'extérieur (PLAN §3).
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';

import { AuthController } from './auth.controller.ts';
import { DbModule } from '../db/db.module.ts';
import { AccountsModule } from '../accounts/accounts.module.ts';
import { GeoModule } from '../geo/geo.module.ts';
import { QueuesModule } from '../shared/queues.ts';
import { GeoController } from './geo.controller.ts';
import { type Config, CONFIG } from '../config/config.ts';
import { ConfigModule } from '../config/config.module.ts';
import { ErrorFilter } from './http/error-filter.ts';
import { LIMITS, rateLimitPrefix, RedisRateLimitStorage } from './http/rate-limit.ts';
import { loggingOptions } from '../shared/logs.ts';
import { OriginCheck } from './http/origin.ts';
import { SessionGuard } from './http/session.guard.ts';
import { REDIS, RedisModule } from '../shared/redis.ts';
import { SystemController } from './system.controller.ts';
import { FilesModule } from '../shared/files.ts';
import { StudiesModule } from '../studies/studies.module.ts';
import { StudiesController } from './studies.controller.ts';

@Module({})
export class ApiModule implements NestModule {
  static forConfig(config?: Config) {
    return {
      module: ApiModule,
      imports: [
        ConfigModule.forConfig(config),
        LoggerModule.forRootAsync({ inject: [CONFIG], useFactory: loggingOptions }),
        DbModule,
        RedisModule,
        QueuesModule.forRoot(),
        AccountsModule,
        FilesModule,
        GeoModule,
        StudiesModule,
        ThrottlerModule.forRootAsync({
          inject: [REDIS, CONFIG],
          useFactory: (redis: Redis, c: Config) => ({
            throttlers: LIMITS,
            storage: new RedisRateLimitStorage(redis, rateLimitPrefix(c)),
          }),
        }),
      ],
      controllers: [AuthController, GeoController, StudiesController, SystemController],
      providers: [
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginCheck).forRoutes('*');
  }
}
