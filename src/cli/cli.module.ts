// Point d'entrée CLI : commandes métier et d'exploitation, sur les mêmes services que l'API.
import { Module } from '@nestjs/common';

import { DbModule } from '../db/db.module.ts';
import { MigrateCommand, SeedCommand } from './db.commands.ts';
import {
  CreateAdminCommand,
  DeactivateCommand,
  ListUsersCommand,
  ReactivateCommand,
  ResetPasswordCommand,
  SetPasswordCommand,
} from './user.commands.ts';
import { AccountsModule } from '../accounts/accounts.module.ts';
import type { Config } from '../config/config.ts';
import { ConfigModule } from '../config/config.module.ts';
import { GeoModule } from '../geo/geo.module.ts';
import { IngestionModule } from '../ingestion/ingestion.module.ts';
import { QueuesModule } from '../shared/queues.ts';
import { RedisModule } from '../shared/redis.ts';
import { GEO_COMMANDS } from './geo.commands.ts';
import { STUDY_COMMANDS } from './study.commands.ts';
import { MARKET_COMMANDS } from './market.commands.ts';
import { RISK_COMMANDS } from './risk.commands.ts';
import { FilesModule } from '../shared/files.ts';
import { StudiesModule } from '../studies/studies.module.ts';

@Module({})
export class CliModule {
  static forConfig(config?: Config) {
    return {
      module: CliModule,
      imports: [
        ConfigModule.forConfig(config),
        DbModule,
        RedisModule,
        QueuesModule.forRoot(),
        AccountsModule,
        FilesModule,
        GeoModule,
        StudiesModule,
        IngestionModule,
      ],
      providers: [
        MigrateCommand,
        SeedCommand,
        CreateAdminCommand,
        ResetPasswordCommand,
        SetPasswordCommand,
        DeactivateCommand,
        ReactivateCommand,
        ListUsersCommand,
        ...GEO_COMMANDS,
        ...STUDY_COMMANDS,
        ...RISK_COMMANDS,
        ...MARKET_COMMANDS,
      ],
    };
  }
}
