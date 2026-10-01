// Commandes d'exploitation de la base : migrations et seed.
import { Inject } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import type pg from 'pg';

import { POOL, runMigrations } from '../db/db.ts';
import { REFERENCE_COMMUNES, ReferenceSeed } from '../ingestion/reference-seed.ts';

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

@Command({
  name: 'seed',
  arguments: '[communes...]',
  description: 'Remplit la base depuis les fixtures (idempotent, sans appel externe) ; par défaut, les communes de référence',
})
export class SeedCommand extends CommandRunner {
  constructor(private readonly reference: ReferenceSeed) {
    super();
  }

  // Les comptes se créent par `user:create-admin` ; le PLU des communes de référence viendra en L3.
  async run(communes: string[] = []): Promise<void> {
    for (const c of await this.reference.run(communes.length > 0 ? communes : REFERENCE_COMMUNES)) {
      const what = c.skipped ? 'déjà à jour' : 'chargée';
      console.log(`Seed : ${c.name} (${c.code}) ${what}, ${c.parcels} parcelles, millésime ${c.version}.`);
    }
  }
}
