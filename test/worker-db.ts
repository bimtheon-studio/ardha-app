// Chargé avant chaque fichier de test d'intégration : chaque worker de Vitest a sa propre base,
// clonée une fois depuis la base modèle `ardha_test` (migrée par `setup-db.ts`). Les fichiers
// s'exécutent donc en parallèle ; dans un même worker, ils se suivent et remettent la base à zéro
// avant chaque test.
import pg from 'pg';

import { testDatabaseUrl } from './env.ts';

const DUPLICATE_DATABASE = '42P04';

const template = new URL(testDatabaseUrl());
const templateName = template.pathname.slice(1);
const name = `${templateName}_w${process.env.VITEST_POOL_ID ?? '0'}`;

const admin = new pg.Client({ connectionString: new URL('/postgres', template).toString() });
await admin.connect();
try {
  await admin.query(`CREATE DATABASE ${name} TEMPLATE ${templateName}`);
} catch (error) {
  if ((error as { code?: string }).code !== DUPLICATE_DATABASE) throw error;
} finally {
  await admin.end();
}

const own = new URL(template);
own.pathname = `/${name}`;
process.env.DATABASE_URL_TEST = own.toString();
