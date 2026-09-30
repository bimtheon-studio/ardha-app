// Préparation globale : la base modèle `ardha_test` recréée de zéro puis migrée ; les bases des
// workers (`ardha_test_w<n>`, voir `worker-db.ts`) en sont clonées. Rejouer toutes les migrations à
// chaque passage vérifie aussi qu'elles s'appliquent sur une base vide.
import pg from 'pg';

import { runMigrations } from '../src/db/db.ts';
import { testDatabaseUrl } from './env.ts';

export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name) || !name.endsWith('_test')) {
    throw new Error(`Refus de recréer « ${name} » : la base de test doit finir par _test.`);
  }
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: maintenance.toString() });
  await admin.connect();
  try {
    const clones = await admin.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datname ~ $1`,
      [`^${name}_w[0-9]+$`],
    );
    for (const { datname } of clones.rows) await admin.query(`DROP DATABASE ${datname} WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
