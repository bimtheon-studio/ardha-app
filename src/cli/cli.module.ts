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
} from './user.commands.ts';
import { AccountsModule } from '../accounts/accounts.module.ts';
import type { Config } from '../config/config.ts';
import { ConfigModule } from '../config/config.module.ts';

@Module({})
export class CliModule {
  static forConfig(config?: Config) {
    return {
      module: CliModule,
      imports: [ConfigModule.forConfig(config), DbModule, AccountsModule],
      providers: [
        MigrateCommand,
        SeedCommand,
        CreateAdminCommand,
        ResetPasswordCommand,
        DeactivateCommand,
        ReactivateCommand,
        ListUsersCommand,
      ],
    };
  }
}
