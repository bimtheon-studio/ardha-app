// Stack jetable des tests e2e, lancée par Playwright (`webServer`) : base `ardha_e2e` recréée,
// migrée et semée (communes de référence), back compilé, front construit, puis API, worker et front
// servis sur les ports e2e du worktree. Sans Internet : sources enregistrées.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

import { Redis } from 'ioredis';
import pg from 'pg';

import { e2eEnv, ROOT } from './env.ts';

const { api, web, env } = e2eEnv();

function run(command: string, args: string[]): void {
  const r = spawnSync(command, args, { cwd: ROOT, env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`Échec de ${command} ${args.join(' ')}`);
}

async function recreateDatabase(): Promise<void> {
  const url = new URL(env.DATABASE_URL!);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
}

/** Compteurs du limiteur et files des passages précédents : chaque passage part de zéro. */
async function clearRedis(): Promise<void> {
  const redis = new Redis(env.REDIS_URL!);
  try {
    for (const prefix of [`ardha:${env.SESSION_COOKIE_NAME}:`, `${env.QUEUE_PREFIX}:`]) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== '0');
    }
  } finally {
    redis.disconnect();
  }
}

await Promise.all([recreateDatabase(), clearRedis()]);
run('pnpm', ['run', '--silent', 'build:back']);
run('node', ['dist/cli/main.js', 'migrate']);
run('node', ['dist/cli/main.js', 'seed']);
if (!process.env.E2E_SKIP_FRONT_BUILD) run('pnpm', ['--filter', './frontend', 'run', '--silent', 'build']);

const children: ChildProcess[] = [
  spawn('node', ['--enable-source-maps', 'dist/routes/main.js'], { cwd: ROOT, env, stdio: 'inherit' }),
  spawn('node', ['--enable-source-maps', 'dist/worker/main.js'], { cwd: ROOT, env, stdio: 'inherit' }),
  spawn('pnpm', ['--filter', './frontend', 'exec', 'vite', 'preview', '--port', String(web), '--strictPort'], { cwd: ROOT, env, stdio: 'inherit' }),
];
console.log(`Stack e2e : front http://127.0.0.1:${web}, API http://127.0.0.1:${api}`);

const stop = () => {
  for (const c of children) c.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', (code) => code && code !== 0 && stop());
