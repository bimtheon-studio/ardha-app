// Connexion à PostgreSQL par Drizzle. L'accès aux données est confiné aux repositories (D-06).
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import pg from 'pg';

import * as schema from './schema.ts';

export type Db = NodePgDatabase<typeof schema>;

export const DB = Symbol('DB');
export const POOL = Symbol('POOL');

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../drizzle');

export function createPool(url: string): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 10, application_name: 'ardha' });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle({ client: pool, schema, casing: 'snake_case' });
}

/**
 * Clé du verrou consultatif des migrations. Un verrou consultatif vaut pour une base : chaque
 * environnement (une base chacun, D-13) a donc le sien.
 */
export const MIGRATION_LOCK = 7_302_118_001;

/**
 * Joue les migrations en attente, dans l'ordre, chacune dans sa transaction. Chaque conteneur les
 * lance à son démarrage, et once démarre le nouveau avant d'arrêter l'ancien : un verrou consultatif
 * (`pg_advisory_lock`, fonction native : la base reste « bête ») fait passer une session à la fois.
 */
export async function runMigrations(pool: pg.Pool): Promise<void> {
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    try {
      await migrate(createDb(pool), { migrationsFolder: MIGRATIONS_DIR });
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    }
  } finally {
    lock.release();
  }
}
