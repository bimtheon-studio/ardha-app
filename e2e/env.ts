// Environnement de la stack e2e : la base `ardha_e2e` et les ports e2e du worktree (`.env.local`,
// généré par `pnpm start`), ou les variables de la CI. Sources enregistrées : aucun appel à Internet.
import { existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');

export function e2eEnv(): { api: number; web: number; env: NodeJS.ProcessEnv } {
  const file = path.join(ROOT, '.env.local');
  if (existsSync(file)) process.loadEnvFile(file);
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL manquante : lancer `pnpm start --infra` (ou la définir en CI).');
  const api = Number(process.env.E2E_API_PORT ?? 17000);
  const web = Number(process.env.E2E_WEB_PORT ?? 18000);
  const db = new URL(base);
  db.pathname = '/ardha_e2e';
  return {
    api,
    web,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: db.toString(),
      API_PORT: String(api),
      WEB_PORT: String(web),
      WEB_ORIGIN: `http://127.0.0.1:${web}`,
      SESSION_COOKIE_NAME: 'ardha_e2e',
      QUEUE_PREFIX: 'ardha:e2e',
      ARDHA_SOURCES: 'recorded',
      LOG_LEVEL: 'warn',
      // Le relais du front (vite preview), puis l'IP simulée par chaque test (e2e/helpers.ts).
      TRUST_PROXY: '2',
    },
  };
}
