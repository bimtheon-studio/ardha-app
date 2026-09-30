// Configuration, lue une fois dans l'environnement et validée. En développement, `.env.local` (généré
// par `pnpm start`, aux ports du worktree) complète l'environnement sans jamais l'écraser.
import { existsSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

export const RACINE_DEPOT = path.resolve(import.meta.dirname, '../..');

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  API_PORT: z.coerce.number().int().positive().default(13000),
  /** Interface d'écoute : la boucle locale en développement, `0.0.0.0` dans un conteneur. */
  API_HOTE: z.string().default('127.0.0.1'),
  /** Origine du front : liens envoyés par la CLI, contrôle de l'en-tête Origin. */
  WEB_ORIGIN: z.url(),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_]+$/).default('ardha_session'),
  /** Nombre de mandataires (proxy, répartiteur) devant l'API, pour lire la vraie IP du client. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof Schema> & { production: boolean };

export const CONFIG = Symbol('CONFIG');

export function chargerEnvLocal(racine = RACINE_DEPOT): void {
  const fichier = path.join(racine, '.env.local');
  if (process.env.NODE_ENV !== 'production' && existsSync(fichier)) process.loadEnvFile(fichier);
}

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Schema.safeParse(env);
  if (!r.success) {
    const details = r.error.issues.map((i) => `  ${i.path.join('.')} : ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${details}\n(en local : \`pnpm start\` génère .env.local)`);
  }
  return { ...r.data, production: r.data.NODE_ENV === 'production' };
}
