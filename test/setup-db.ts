// Préparation globale : `ardha_test` recréée de zéro puis migrée. Rejouer toutes les migrations à
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
