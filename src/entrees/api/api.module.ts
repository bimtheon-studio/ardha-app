// Point d'entrée API : REST pour le front. Ne sort jamais vers l'extérieur (PLAN §3).
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';

import { AuthController } from './auth.controller.ts';
import { BaseModule } from '../../base/base.module.ts';
import { ComptesModule } from '../../comptes/comptes.module.ts';
import { type Config, CONFIG } from '../../config/config.ts';
import { ConfigModule } from '../../config/config.module.ts';
import { FiltreErreurs } from './http/filtre-erreurs.ts';
import { LIMITES, StockageRedisLimites } from './http/limiteur.ts';
import { optionsJournalisation } from '../../commun/logs.ts';
import { ControleOrigine } from './http/origine.ts';
import { SessionGuard } from './http/session.guard.ts';
import { REDIS, RedisModule } from '../../commun/redis.ts';
import { SystemeController } from './systeme.controller.ts';

@Module({})
export class ApiModule implements NestModule {
  static pour(config?: Config) {
    return {
      module: ApiModule,
      imports: [
        ConfigModule.pour(config),
        LoggerModule.forRootAsync({ inject: [CONFIG], useFactory: optionsJournalisation }),
        BaseModule,
        RedisModule,
        ComptesModule,
        ThrottlerModule.forRootAsync({
          inject: [REDIS, CONFIG],
          useFactory: (redis: Redis, c: Config) => ({
            throttlers: LIMITES,
            storage: new StockageRedisLimites(redis, `ardha:${c.SESSION_COOKIE_NAME}:limite`),
          }),
        }),
      ],
      controllers: [AuthController, SystemeController],
      providers: [
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_FILTER, useClass: FiltreErreurs },
      ],
    };
  }

  configure(consommateur: MiddlewareConsumer): void {
    consommateur.apply(ControleOrigine).forRoutes('*');
  }
}
