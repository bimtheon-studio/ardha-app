// Environnement des tests d'intégration : la base `ardha_test` et le Redis du worktree courant
// (`.env.local`, généré par `pnpm start`), ou les variables de la CI.
import { randomBytes } from 'node:crypto';

import { loadLocalEnv, type Config, readConfig } from '../src/config/config.ts';

export function testDatabaseUrl(): string {
  loadLocalEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST manquante : lancer `pnpm start --infra` (ou la définir en CI).');
  return url;
}

/**
 * Config de test. Le nom de cookie et le préfixe des files, uniques, isolent dans Redis les compteurs
 * du limiteur et les jobs (le worker de développement ne les voit pas). Sources enregistrées : aucun
 * appel à Internet.
 */
export function testConfig(overrides: NodeJS.ProcessEnv = {}): Config {
  loadLocalEnv();
  const id = randomBytes(4).toString('hex');
  return readConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    WEB_ORIGIN: 'http://127.0.0.1:14000',
    SESSION_COOKIE_NAME: `test_${id}`,
    QUEUE_PREFIX: `test:${id}`,
    ARDHA_SOURCES: 'recorded',
    TRUST_PROXY: '1',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}
