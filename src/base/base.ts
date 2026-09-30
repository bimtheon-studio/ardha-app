// Connexion à PostgreSQL par Drizzle. L'accès aux données est confiné aux repositories (D-06).
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import pg from 'pg';

import * as schema from './schema.ts';

export type Base = NodePgDatabase<typeof schema>;

export const BASE = Symbol('BASE');
export const POOL = Symbol('POOL');

export const DOSSIER_MIGRATIONS = path.resolve(import.meta.dirname, '../../drizzle');

export function creerPool(url: string): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 10, application_name: 'ardha' });
}

export function creerBase(pool: pg.Pool): Base {
  return drizzle({ client: pool, schema, casing: 'snake_case' });
}

/** Joue les migrations en attente, dans l'ordre, chacune dans sa transaction. */
export async function migrer(pool: pg.Pool): Promise<void> {
  await migrate(creerBase(pool), { migrationsFolder: DOSSIER_MIGRATIONS });
}
