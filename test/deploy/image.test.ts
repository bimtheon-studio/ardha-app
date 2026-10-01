// Test de l'image de production (lot LD) : construite par le Dockerfile, démarrée comme once la
// démarre (port 80, BASE_URL, DISABLE_SSL, volume /storage), contre le Postgres et le Redis de la
// stack du worktree, sur leur réseau Docker. `pnpm test:deploy` (l'image est construite par
// `build-image.ts`).
import { execFileSync, spawnSync } from 'node:child_process';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadLocalEnv } from '../../src/config/config.ts';
import { IMAGE } from './build-image.ts';

loadLocalEnv();
const RUN = `ardha-image-${process.pid}`;
const BASE_URL = 'http://ardha-image.localhost';
const PASSWORD = 'cheval pomme agrafe';

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** URL d'une base de la stack, vue de l'hôte (`host`) ou d'un conteneur du réseau de la stack. */
function databaseUrl(name: string, from: 'host' | 'network'): string {
  const u = new URL(process.env.DATABASE_URL!);
  u.pathname = `/${name}`;
  if (from === 'network') {
    u.hostname = 'postgres';
    u.port = '5432';
  }
  return u.toString();
}

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: databaseUrl('postgres', 'host') });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function recreate(name: string, extensions = false): Promise<void> {
  await admin(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${name}`);
  });
  if (!extensions) return;
  // Comme `ardha-env` sur le serveur : les extensions sont créées avec la base, par le superutilisateur.
  const c = new pg.Client({ connectionString: databaseUrl(name, 'host') });
  await c.connect();
  await c.query('CREATE EXTENSION postgis; CREATE EXTENSION vector');
  await c.end();
}

async function count(database: string, sql: string): Promise<number> {
  const c = new pg.Client({ connectionString: databaseUrl(database, 'host') });
  await c.connect();
  try {
    return Number((await c.query<{ n: string }>(sql)).rows[0]!.n);
  } finally {
    await c.end();
  }
}

async function eventually(check: () => Promise<boolean>, what: string, timeoutMs = 90_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!(await check().catch(() => false))) {
    if (Date.now() > end) throw new Error(`${what} : délai dépassé\n${docker('logs', '--tail', '50', RUN)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

let base: string;
const get = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...init });

beforeAll(async () => {
  await Promise.all([recreate('ardha_image'), recreate('ardha_image_restore', true)]);
  docker(
    'run', '--detach', '--name', RUN,
    '--network', `${process.env.ARDHA_PROJECT}_default`,
    '--publish', '127.0.0.1::80',
    '--memory', '512m',
    '--volume', `${RUN}:/storage`,
    '--env', `DATABASE_URL=${databaseUrl('ardha_image', 'network')}`,
    '--env', 'REDIS_URL=redis://redis:6379',
    '--env', 'REDIS_PREFIX=ardha-image',
    '--env', `BASE_URL=${BASE_URL}`,
    '--env', 'DISABLE_SSL=true',
    '--env', 'SECRET_KEY_BASE=inutilise',
    '--env', 'ARDHA_SEED_ON_BOOT=true',
    IMAGE,
  );
  base = `http://${docker('port', RUN, '80/tcp').split('\n')[0]}`;
}, 300_000);

afterAll(async () => {
  spawnSync('docker', ['rm', '--force', '--volumes', RUN]);
  spawnSync('docker', ['volume', 'rm', RUN]);
  await admin(async (c) => {
    await c.query('DROP DATABASE IF EXISTS ardha_image WITH (FORCE)');
    await c.query('DROP DATABASE IF EXISTS ardha_image_restore WITH (FORCE)');
  });
});

describe('image de production', { timeout: 120_000 }, () => {
  it('migre, démarre et répond sur /up', async () => {
    await eventually(async () => (await get('/up')).ok, '/up');
    expect(await (await get('/up')).json()).toEqual({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('sert le front : index.html sans cache, repli SPA, assets immuables', async () => {
    const index = await get('/');
    expect(index.status).toBe(200);
    expect(index.headers.get('cache-control')).toBe('no-cache');
    const html = await index.text();
    expect(html).toMatch(/<div id="root">/);
    const map = await get('/map');
    expect(await map.text()).toBe(html);
    const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)![1]!;
    const js = await get(asset);
    expect(js.status).toBe(200);
    expect(js.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('sème les communes de référence au premier démarrage', async () => {
    // Le bilan s'imprime une fois toutes les communes chargées.
    await eventually(async () => /Seed : Beaumont-Village \(37023\) chargée/.test(docker('logs', RUN)), 'seed');
    expect(await count('ardha_image', 'SELECT count(*) AS n FROM communes')).toBe(4);
  });

  it('administrateur créé par la CLI du conteneur ; connexion par l’origine de BASE_URL, cookie sans Secure', async () => {
    const created = spawnSync('docker', ['exec', '-i', RUN, 'ardha', 'user:create-admin', '-e', 'admin@ardha.fr', '-n', 'Admin', '--password-stdin'], {
      input: PASSWORD,
      encoding: 'utf8',
    });
    expect(created.stdout).toMatch(/Administrateur créé : admin@ardha\.fr/);
    const login = await get('/api/auth/login', {
      method: 'POST',
      headers: { Origin: BASE_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@ardha.fr', password: PASSWORD }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().find((c) => c.startsWith('ardha_session='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).not.toMatch(/Secure/);
    const me = await get('/api/auth/me', { headers: { Cookie: cookie.split(';')[0]! } });
    expect(me.status).toBe(200);
  });

  it('les clés Redis de l’environnement portent son préfixe', () => {
    const keys = docker('exec', `${process.env.ARDHA_PROJECT}-redis-1`, 'redis-cli', '--scan', '--pattern', 'ardha-image:*');
    expect(keys).toMatch(/^ardha-image:bull:/m);
  });

  it('sauvegarde (pre-backup) puis restauration (post-restore) rendent la même base', async () => {
    expect(docker('exec', RUN, '/hooks/pre-backup')).toMatch(/base sauvegardée/);
    const restored = docker('exec', '--env', `DATABASE_URL=${databaseUrl('ardha_image_restore', 'network')}`, RUN, '/hooks/post-restore');
    expect(restored).toMatch(/base restaurée/);
    for (const sql of [
      'SELECT count(*) AS n FROM users',
      'SELECT count(*) AS n FROM parcels',
      'SELECT count(*) AS n FROM communes',
      'SELECT count(*) AS n FROM drizzle.__drizzle_migrations',
    ]) {
      expect(await count('ardha_image_restore', sql), sql).toBe(await count('ardha_image', sql));
    }
  });

  it('mémoire : rapportée pour les plafonds once (--memory)', () => {
    const usage = docker('stats', '--no-stream', '--format', '{{.MemUsage}}', RUN);
    const peak = Number(docker('exec', RUN, 'cat', '/sys/fs/cgroup/memory.peak')) / 2 ** 20;
    console.log(`Mémoire du conteneur après seed et connexion : ${usage} ; pic : ${peak.toFixed(0)} MiB`);
    expect(peak).toBeLessThan(512);
  });

  it('s’arrête proprement sur SIGTERM, avant le délai de Docker', () => {
    const started = Date.now();
    docker('stop', '--time', '10', RUN);
    expect(Date.now() - started).toBeLessThan(9_000);
    expect(docker('inspect', '--format', '{{.State.ExitCode}}', RUN)).toBe('0');
  });
});
