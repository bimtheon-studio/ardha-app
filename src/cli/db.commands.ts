// Commandes d'exploitation de la base : migrations et seed.
import { Inject } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import type pg from 'pg';

import { POOL, runMigrations } from '../db/db.ts';

@Command({ name: 'migrate', description: 'Joue les migrations en attente (en production : par la CD uniquement)' })
export class MigrateCommand extends CommandRunner {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {
    super();
  }

  async run(): Promise<void> {
    await runMigrations(this.pool);
    console.log('Migrations à jour.');
  }
}

@Command({ name: 'seed', description: 'Remplit la base de développement depuis les fixtures (idempotent, sans appel externe)' })
export class SeedCommand extends CommandRunner {
  async run(): Promise<void> {
    // L0 n'a pas encore de données de référence : les fixtures des communes de référence arrivent
    // avec L1 (cadastre) et L3 (PLU). Les comptes se créent par `user:create-admin`.
    console.log('Seed : rien à semer en L0.');
  }
}
