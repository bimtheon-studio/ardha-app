// Chargé avant chaque fichier de test d'intégration : chaque worker de Vitest a sa propre base,
// clonée une fois depuis la base modèle `ardha_test` (migrée par `setup-db.ts`). Les fichiers
// s'exécutent donc en parallèle ; dans un même worker, ils se suivent et remettent la base à zéro
// avant chaque test.
import pg from 'pg';

import { testDatabaseUrl } from './env.ts';

const DUPLICATE_DATABASE = '42P04';
/** Deux clonages simultanés du même modèle : PostgreSQL refuse le second (« accessed by other users »). */
const TEMPLATE_IN_USE = '55006';

const template = new URL(testDatabaseUrl());
const templateName = template.pathname.slice(1);
const name = `${templateName}_w${process.env.VITEST_POOL_ID ?? '0'}`;

const admin = new pg.Client({ connectionString: new URL('/postgres', template).toString() });
await admin.connect();
try {
  // Les workers démarrent ensemble : on réessaie tant qu'un autre clone le modèle.
  for (let attempt = 1; ; attempt++) {
    try {
      await admin.query(`CREATE DATABASE ${name} TEMPLATE ${templateName}`);
      break;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === DUPLICATE_DATABASE) break;
      if (code !== TEMPLATE_IN_USE || attempt >= 100) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80));
    }
  }
} finally {
  await admin.end();
}

const own = new URL(template);
own.pathname = `/${name}`;
process.env.DATABASE_URL_TEST = own.toString();
