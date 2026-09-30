// URL du Postgres de test : variable d'environnement, sinon `.env.local` du checkout.
// En CI (`CI=true`), son absence est une erreur : un test d'intégration ne se saute pas en silence.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { lireEnv } from '../stack/fichiers.ts';

export function urlDeTest(): string | undefined {
  const fichier = path.resolve(import.meta.dirname, '../../.env.local');
  const url =
    process.env.DATABASE_URL_TEST ??
    (existsSync(fichier) ? lireEnv(readFileSync(fichier, 'utf8')).get('DATABASE_URL_TEST') : undefined);
  if (!url && process.env.CI === 'true') {
    throw new Error('DATABASE_URL_TEST manquante en CI.');
  }
  return url;
}
