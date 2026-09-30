// Fichiers locaux générés par `pnpm start`, ignorés par git : l'override Compose et `.env.local`.
import { randomBytes } from 'node:crypto';

import type { Context } from './context.ts';

export const BLOCK_START = '# >>> ardha stack (généré par `pnpm start`, ne pas committer) >>>';
export const BLOCK_END = '# <<< ardha stack <<<';

/** Mots de passe locaux : tirés au hasard au premier démarrage, puis conservés dans `.env.local`. */
export interface Secrets {
  postgres: string;
  minio: string;
}

export function newSecrets(): Secrets {
  return { postgres: randomSecret(), minio: randomSecret() };
}

function randomSecret(): string {
  return randomBytes(18).toString('base64url');
}

/** Relit les secrets d'un `.env.local` existant, pour ne pas les changer sous un volume déjà initialisé. */
export function existingSecrets(env: string): Secrets | null {
  const vars = parseEnv(env);
  // Anciens noms (avant le passage en anglais) en repli : un volume déjà créé garde son mot de passe.
  const postgres = vars.get('ARDHA_POSTGRES_PASSWORD') ?? vars.get('ARDHA_POSTGRES_MOT_DE_PASSE');
  const minio = vars.get('ARDHA_MINIO_PASSWORD') ?? vars.get('ARDHA_MINIO_MOT_DE_PASSE');
  return postgres && minio ? { postgres, minio } : null;
}

export function override(ctx: Context, secrets: Secrets): string {
  const { ports } = ctx;
  return [
    `# Généré par \`pnpm start\` pour « ${ctx.project} » (branche ${ctx.branch}, décalage +${ctx.offset}).`,
    '# Ne pas committer (ignoré par git). Ports publiés sur 127.0.0.1 uniquement.',
    `name: ${ctx.project}`,
    'services:',
    '  postgres:',
    '    environment:',
    `      POSTGRES_PASSWORD: ${secrets.postgres}`,
    '    ports: !override',
    `      - 127.0.0.1:${ports.postgres}:5432`,
    '  redis:',
    '    ports: !override',
    `      - 127.0.0.1:${ports.redis}:6379`,
    '  minio:',
    '    environment:',
    `      MINIO_ROOT_PASSWORD: ${secrets.minio}`,
    '    ports: !override',
    `      - 127.0.0.1:${ports.minio}:9000`,
    `      - 127.0.0.1:${ports.minioConsole}:9001`,
    '',
  ].join('\n');
}

export function variables(ctx: Context, secrets: Secrets): Record<string, string> {
  const { ports } = ctx;
  const pg = (db: string) =>
    `postgres://ardha:${secrets.postgres}@127.0.0.1:${ports.postgres}/${db}`;
  return {
    ARDHA_PROJECT: ctx.project,
    ARDHA_POSTGRES_PASSWORD: secrets.postgres,
    ARDHA_MINIO_PASSWORD: secrets.minio,
    DATABASE_URL: pg('ardha'),
    DATABASE_URL_TEST: pg('ardha_test'),
    REDIS_URL: `redis://127.0.0.1:${ports.redis}`,
    S3_ENDPOINT: `http://127.0.0.1:${ports.minio}`,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'ardha',
    S3_SECRET_ACCESS_KEY: secrets.minio,
    S3_BUCKET: 'ardha',
    API_PORT: String(ports.api),
    WEB_PORT: String(ports.web),
    WEB_ORIGIN: `http://127.0.0.1:${ports.web}`,
    E2E_API_PORT: String(ports.e2eApi),
    E2E_WEB_PORT: String(ports.e2eWeb),
    SESSION_COOKIE_NAME: ctx.cookieSession,
  };
}

/** Tout bloc généré, y compris sous un ancien libellé d'en-tête (« pnpm demarrer »). */
const ANY_BLOCK = /# >>> ardha stack[^\n]*\n[\s\S]*?# <<< ardha stack <<<\n?/g;

/**
 * Insère ou remplace le bloc généré dans un `.env.local`, sans toucher au reste du fichier. Les blocs
 * en double (écrits par une version qui ne retrouvait pas le sien) sont retirés : il n'en reste qu'un,
 * à la place du premier.
 */
export function upsertBlock(existing: string, vars: Record<string, string>): string {
  const block = [BLOCK_START, ...Object.entries(vars).map(([k, v]) => `${k}=${v}`), BLOCK_END].join('\n');
  const first = existing.search(ANY_BLOCK);
  if (first !== -1) {
    const before = existing.slice(0, first);
    const after = existing.slice(first).replace(ANY_BLOCK, '').replace(/^\n+/, '');
    return `${before}${block}\n${after ? `\n${after}` : ''}`;
  }
  const rest = existing.trimEnd();
  return (rest ? `${rest}\n\n` : '') + block + '\n';
}

/** Lecture minimale d'un fichier `.env` : `CLE=valeur`, commentaires `#`, pas de guillemets. */
export function parseEnv(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const line of content.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i > 0) vars.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
  }
  return vars;
}
