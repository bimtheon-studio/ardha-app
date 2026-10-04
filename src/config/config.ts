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
  /**
   * Préfixe de toutes les clés Redis d'un environnement (files, cache, limiteur) : plusieurs
   * environnements partagent le même Redis sur le serveur (D-13).
   */
  REDIS_PREFIX: z.string().regex(/^[A-Za-z0-9_-]+$/).default('ardha'),
  /** Préfixe des clés BullMQ : `<REDIS_PREFIX>:bull` ; les tests ont le leur, pour ne pas croiser le worker de dev. */
  QUEUE_PREFIX: z.string().regex(/^[A-Za-z0-9:_-]+$/).optional(),
  /** once sert l'application sans TLS (`--disable-tls`) : le cookie de session perd alors `Secure`. */
  DISABLE_SSL: z.stringbool().default(false),
  /** Sème les communes de référence au démarrage du conteneur si la base est vide (environnements de PR). */
  ARDHA_SEED_ON_BOOT: z.stringbool().default(false),
  /** Front construit (`frontend/dist`) servi par l'API, à la même origine ; absent en développement (Vite). */
  FRONTEND_DIR: z.string().optional(),
  /**
   * Sources publiques : `live` (Internet), `recorded` (réponses de `fixtures/http`, sans Internet :
   * tests, e2e, démonstration hors ligne), `record` (Internet, et chaque réponse est enregistrée
   * dans `fixtures/http`).
   */
  ARDHA_SOURCES: z.enum(['live', 'recorded', 'record']).default('live'),
  FIXTURES_DIR: z.string().default(path.join(REPO_ROOT, 'fixtures/http')),
  /** Attente maximale d'une recherche confiée au worker, en millisecondes (F-01, Q1). */
  LOOKUP_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  /**
   * Magasin de fichiers (F-02, Q11) : `disk` (production, sous `/storage`) ou `s3` (MinIO en local
   * et en test).
   */
  FILES_DRIVER: z.enum(['disk', 's3']).default('disk'),
  FILES_DIR: z.string().default(path.join(REPO_ROOT, '.files')),
  /** Préfixe des clés : les tests ont le leur dans le bucket de développement. */
  FILES_PREFIX: z.string().regex(/^(?:[a-z0-9_-]+\/)*$/).default(''),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /**
   * Millésimes DVF chargés par département (F-05 Q1), les plus récents : tous ceux publiés si absent.
   * 2 en test et en e2e, pour des enregistrements légers.
   */
  DVF_YEARS: z.coerce.number().int().min(1).max(20).optional(),
  /** Jeton de l'API Géorisques v2 (F-04, Q12), pour le worker ; sans lui, l'analyse lit la v1. */
  GEORISQUES_TOKEN: z
    .string()
    .optional()
    .transform((v) => v || undefined),
}).refine((c) => c.FILES_DRIVER !== 's3' || (c.S3_ENDPOINT && c.S3_BUCKET && c.S3_ACCESS_KEY_ID && c.S3_SECRET_ACCESS_KEY), {
  message: 'FILES_DRIVER=s3 demande S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY.',
  path: ['FILES_DRIVER'],
});

export type Config = Omit<z.infer<typeof Schema>, 'QUEUE_PREFIX'> & {
  QUEUE_PREFIX: string;
  production: boolean;
  /** Cookie de session `Secure` : en production, sauf derrière once sans TLS. */
  secureCookies: boolean;
};

export const CONFIG = Symbol('CONFIG');

export function loadLocalEnv(root = REPO_ROOT): void {
  const file = path.join(root, '.env.local');
  if (process.env.NODE_ENV !== 'production' && existsSync(file)) process.loadEnvFile(file);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // once injecte l'URL publique de l'application dans BASE_URL.
  const r = Schema.safeParse({ ...env, WEB_ORIGIN: env.WEB_ORIGIN ?? env.BASE_URL });
  if (!r.success) {
    const details = r.error.issues.map((i) => `  ${i.path.join('.')} : ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${details}\n(en local : \`pnpm start\` génère .env.local)`);
  }
  const production = r.data.NODE_ENV === 'production';
  return {
    ...r.data,
    QUEUE_PREFIX: r.data.QUEUE_PREFIX ?? `${r.data.REDIS_PREFIX}:bull`,
    production,
    secureCookies: production && !r.data.DISABLE_SSL,
  };
}
