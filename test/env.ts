// Environnement des tests d'intégration : la base `ardha_test` et le Redis du worktree courant
// (`.env.local`, généré par `pnpm start`), ou les variables de la CI.
import { randomBytes } from 'node:crypto';

import { chargerEnvLocal, type Config, lireConfig } from '../src/config/config.ts';

export function urlBaseDeTest(): string {
  chargerEnvLocal();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST manquante : lancer `pnpm start --infra` (ou la définir en CI).');
  return url;
}

/** Config de test ; le nom de cookie, unique, isole aussi les compteurs du limiteur dans Redis. */
export function configDeTest(): Config {
  chargerEnvLocal();
  return lireConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: urlBaseDeTest(),
    WEB_ORIGIN: 'http://127.0.0.1:14000',
    SESSION_COOKIE_NAME: `test_${randomBytes(4).toString('hex')}`,
    TRUST_PROXY: '1',
    LOG_LEVEL: 'silent',
  });
}
