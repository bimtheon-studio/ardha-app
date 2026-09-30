// Configuration, lue une fois dans l'environnement et validée. En développement, `.env.local` (généré
// par `pnpm start`, aux ports du worktree) complète l'environnement sans jamais l'écraser.
import { existsSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

export const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  API_PORT: z.coerce.number().int().positive().default(13000),
  /** Interface d'écoute : la boucle locale en développement, `0.0.0.0` dans un conteneur. */
  API_HOST: z.string().default('127.0.0.1'),
  /** Origine du front : liens envoyés par la CLI, contrôle de l'en-tête Origin. */
  WEB_ORIGIN: z.url(),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_]+$/).default('ardha_session'),
  /** Nombre de mandataires (proxy, répartiteur) devant l'API, pour lire la vraie IP du client. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Préfixe des clés BullMQ dans Redis : les tests ont le leur, pour ne pas croiser le worker de dev. */
  QUEUE_PREFIX: z.string().regex(/^[A-Za-z0-9:_-]+$/).default('ardha:bull'),
  /**
   * Sources publiques : `live` (Internet), `recorded` (réponses de `fixtures/http`, sans Internet :
   * tests, e2e, démonstration hors ligne).
   */
  ARDHA_SOURCES: z.enum(['live', 'recorded']).default('live'),
  FIXTURES_DIR: z.string().default(path.join(REPO_ROOT, 'fixtures/http')),
  /** Attente maximale d'une recherche confiée au worker, en millisecondes (F-01, Q1). */
  LOOKUP_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
});

export type Config = z.infer<typeof Schema> & { production: boolean };

export const CONFIG = Symbol('CONFIG');

export function loadLocalEnv(root = REPO_ROOT): void {
  const file = path.join(root, '.env.local');
  if (process.env.NODE_ENV !== 'production' && existsSync(file)) process.loadEnvFile(file);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Schema.safeParse(env);
  if (!r.success) {
    const details = r.error.issues.map((i) => `  ${i.path.join('.')} : ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${details}\n(en local : \`pnpm start\` génère .env.local)`);
  }
  return { ...r.data, production: r.data.NODE_ENV === 'production' };
}
