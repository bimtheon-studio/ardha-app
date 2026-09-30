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

/** Joue les migrations en attente, dans l'ordre, chacune dans sa transaction. */
export async function runMigrations(pool: pg.Pool): Promise<void> {
  await migrate(createDb(pool), { migrationsFolder: MIGRATIONS_DIR });
}
