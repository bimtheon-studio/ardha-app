import { type DynamicModule, Global, Module } from '@nestjs/common';

import { CONFIG, type Config, chargerEnvLocal, lireConfig } from './config.ts';

@Global()
@Module({})
export class ConfigModule {
  /** Sans argument : lit l'environnement (et `.env.local` en développement). Les tests passent leur config. */
  static pour(config?: Config): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        {
          provide: CONFIG,
          useFactory: () => {
            if (config) return config;
            chargerEnvLocal();
            return lireConfig();
          },
        },
      ],
      exports: [CONFIG],
    };
  }
}
