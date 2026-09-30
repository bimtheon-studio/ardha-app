// Point d'entrée CLI : commandes métier et d'exploitation, sur les mêmes services que l'API.
import { Module } from '@nestjs/common';

import { BaseModule } from '../db/db.module.ts';
import { CommandeMigrer, CommandeSemer } from './db.commands.ts';
import {
  CommandeCreerAdmin,
  CommandeDesactiver,
  CommandeLister,
  CommandeReactiver,
  CommandeReinitialiser,
} from './user.commands.ts';
import { ComptesModule } from '../accounts/accounts.module.ts';
import type { Config } from '../config/config.ts';
import { ConfigModule } from '../config/config.module.ts';

@Module({})
export class CliModule {
  static pour(config?: Config) {
    return {
      module: CliModule,
      imports: [ConfigModule.pour(config), BaseModule, ComptesModule],
      providers: [
        CommandeMigrer,
        CommandeSemer,
        CommandeCreerAdmin,
        CommandeReinitialiser,
        CommandeDesactiver,
        CommandeReactiver,
        CommandeLister,
      ],
    };
  }
}
