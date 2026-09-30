// Fichiers locaux générés par `pnpm start`, ignorés par git : l'override Compose et `.env.local`.
import { randomBytes } from 'node:crypto';

import type { Contexte } from './context.ts';

export const DEBUT_BLOC = '# >>> ardha stack (généré par `pnpm start`, ne pas committer) >>>';
export const FIN_BLOC = '# <<< ardha stack <<<';

/** Mots de passe locaux : tirés au hasard au premier démarrage, puis conservés dans `.env.local`. */
export interface Secrets {
  postgres: string;
  minio: string;
}

export function nouveauxSecrets(): Secrets {
  return { postgres: aleatoire(), minio: aleatoire() };
}

function aleatoire(): string {
  return randomBytes(18).toString('base64url');
}

/** Relit les secrets d'un `.env.local` existant, pour ne pas les changer sous un volume déjà initialisé. */
export function secretsExistants(env: string): Secrets | null {
  const vars = lireEnv(env);
  const postgres = vars.get('ARDHA_POSTGRES_MOT_DE_PASSE');
  const minio = vars.get('ARDHA_MINIO_MOT_DE_PASSE');
  return postgres && minio ? { postgres, minio } : null;
}

export function override(ctx: Contexte, secrets: Secrets): string {
  const { ports } = ctx;
  return [
    `# Généré par \`pnpm start\` pour « ${ctx.projet} » (branche ${ctx.branche}, décalage +${ctx.decalage}).`,
    '# Ne pas committer (ignoré par git). Ports publiés sur 127.0.0.1 uniquement.',
    `name: ${ctx.projet}`,
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

export function variables(ctx: Contexte, secrets: Secrets): Record<string, string> {
  const { ports } = ctx;
  const pg = (base: string) =>
    `postgres://ardha:${secrets.postgres}@127.0.0.1:${ports.postgres}/${base}`;
  return {
    ARDHA_PROJET: ctx.projet,
    ARDHA_POSTGRES_MOT_DE_PASSE: secrets.postgres,
    ARDHA_MINIO_MOT_DE_PASSE: secrets.minio,
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
    SESSION_COOKIE_NAME: ctx.cookieSession,
  };
}

/** Insère ou remplace le bloc généré dans un `.env.local`, sans toucher au reste du fichier. */
export function upsertBloc(existant: string, vars: Record<string, string>): string {
  const bloc = [DEBUT_BLOC, ...Object.entries(vars).map(([k, v]) => `${k}=${v}`), FIN_BLOC].join('\n');
  const debut = existant.indexOf(DEBUT_BLOC);
  const fin = existant.indexOf(FIN_BLOC);
  if (debut !== -1 && fin > debut) {
    return existant.slice(0, debut) + bloc + existant.slice(fin + FIN_BLOC.length);
  }
  const reste = existant.trimEnd();
  return (reste ? `${reste}\n\n` : '') + bloc + '\n';
}

/** Lecture minimale d'un fichier `.env` : `CLE=valeur`, commentaires `#`, pas de guillemets. */
export function lireEnv(contenu: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const ligne of contenu.split('\n')) {
    const l = ligne.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i > 0) vars.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
  }
  return vars;
}
