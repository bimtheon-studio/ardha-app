// Préparation globale : `ardha_test` recréée de zéro puis migrée. Rejouer toutes les migrations à
// chaque passage vérifie aussi qu'elles s'appliquent sur une base vide.
import pg from 'pg';

import { migrer } from '../src/base/base.ts';
import { urlBaseDeTest } from './environnement.ts';

export default async function preparer(): Promise<void> {
  const url = new URL(urlBaseDeTest());
  const nom = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(nom) || !nom.endsWith('_test')) {
    throw new Error(`Refus de recréer « ${nom} » : la base de test doit finir par _test.`);
  }
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: maintenance.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${nom}`);
  } finally {
    await admin.end();
  }
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    await migrer(pool);
  } finally {
    await pool.end();
  }
}
