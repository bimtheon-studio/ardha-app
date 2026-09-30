// URL du Postgres de test : variable d'environnement, sinon `.env.local` du checkout.
// En CI (`CI=true`), son absence est une erreur : un test d'intégration ne se saute pas en silence.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseEnv } from '../stack/files.ts';

export function testUrl(): string | undefined {
  const file = path.resolve(import.meta.dirname, '../../.env.local');
  const url =
    process.env.DATABASE_URL_TEST ??
    (existsSync(file) ? parseEnv(readFileSync(file, 'utf8')).get('DATABASE_URL_TEST') : undefined);
  if (!url && process.env.CI === 'true') {
    throw new Error('DATABASE_URL_TEST manquante en CI.');
  }
  return url;
}
