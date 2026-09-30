// `pnpm start | stop | destroy | status` : la stack locale, isolée par worktree (D-09).
//
// `start` reconnaît un worktree, décale les ports d'après la branche, génère
// `docker-compose.override.yaml` et `.env.local`, vérifie que les ports sont libres, lance les
// dépendances (Postgres, Redis, MinIO), joue les migrations et le seed, puis l'API, le worker et le
// front au premier plan (Ctrl-C les arrête ; les conteneurs restent). `--infra` s'arrête avant.
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { addresses, link } from './addresses.ts';
import { currentContext, type Context } from './context.ts';
import { newSecrets, override, existingSecrets, upsertBlock, variables } from './files.ts';
import { portReallyFree } from './free-port.ts';
import { LABELS, type Service } from './ports.ts';

const DOCKER_SERVICES: Service[] = ['postgres', 'redis', 'minio', 'minioConsole'];
const LOCAL_SERVICES: Service[] = ['api', 'web'];

function printContext(ctx: Context): void {
  const title = ctx.isWorktree
    ? `Worktree isolé « ${ctx.project} » (branche ${ctx.branch}, décalage +${ctx.offset})`
    : `Clone principal « ${ctx.project} » (branche ${ctx.branch}, décalage +${ctx.offset})`;
  console.log(`\n${title}`);
  console.log(`  Cookie de session : ${ctx.cookieSession}\n`);
}

/** Adresses de la stack, cliquables ; avec `status`, une pastille dit si chacune répond. */
async function printAddresses(ctx: Context, status: boolean): Promise<void> {
  const terminal = Boolean(process.stdout.isTTY);
  for (const a of addresses(ctx)) {
    const dot = status ? ((await portReallyFree(ctx.ports[a.service])) ? '○ ' : '● ') : '';
    console.log(`  ${dot}${a.label.padEnd(16)} ${link(a.url, terminal)}`);
  }
  if (status) console.log('\n  ● répond  ○ arrêté');
  console.log('');
}

function writeFiles(ctx: Context): void {
  const envFile = path.join(ctx.root, '.env.local');
  const existing = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const secrets = existingSecrets(existing) ?? newSecrets();
  writeFileSync(path.join(ctx.root, 'docker-compose.override.yaml'), override(ctx, secrets));
  writeFileSync(envFile, upsertBlock(existing, variables(ctx, secrets)));
  console.log('Fichiers générés : docker-compose.override.yaml, .env.local');
}

/** Ports hôtes déjà publiés par les conteneurs de ce projet Compose (un redémarrage les retrouve pris). */
function projectPorts(ctx: Context): Set<number> {
  const output = execFileSync(
    'docker',
    ['ps', '--filter', `label=com.docker.compose.project=${ctx.project}`, '--format', '{{.Ports}}'],
    { encoding: 'utf8' },
  );
  return new Set([...output.matchAll(/:(\d+)->/g)].map((m) => Number(m[1])));
}

async function checkPorts(ctx: Context, services: Service[]): Promise<void> {
  const ownPorts = projectPorts(ctx);
  const taken: string[] = [];
  for (const service of services) {
    const port = ctx.ports[service];
    if (ownPorts.has(port)) continue;
    if (!(await portReallyFree(port))) taken.push(`  ${LABELS[service]} : ${port}`);
  }
  if (taken.length > 0) {
    throw new Error(
      [
        'Ports déjà pris par un autre processus :',
        ...taken,
        '',
        'Deux branches peuvent tomber sur le même décalage. Libérez ces ports, ou forcez un autre décalage :',
        `  ARDHA_PORT_OFFSET=${ctx.offset >= 404 ? 5 : ctx.offset + 1} pnpm start`,
        '(à redonner à chaque démarrage : il n\'est pas mémorisé).',
      ].join('\n'),
    );
  }
}

function run(command: string, args: string[], ctx: Context): void {
  const r = spawnSync(command, args, { cwd: ctx.root, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`Échec de \`${command} ${args.join(' ')}\` (code ${r.status ?? r.signal}).`);
  }
}

function createBucket(ctx: Context): void {
  run(
    'docker',
    [
      'compose', 'exec', '-T', 'minio', 'sh', '-c',
      'mc alias set local http://127.0.0.1:9000 ardha "$MINIO_ROOT_PASSWORD" >/dev/null && mc mb --ignore-existing local/ardha',
    ],
    ctx,
  );
}

async function start(ctx: Context, infraOnly: boolean): Promise<void> {
  printContext(ctx);
  // Les ports d'abord : un démarrage refusé ne doit pas réécrire la configuration d'une stack qui tourne.
  await checkPorts(ctx, infraOnly ? DOCKER_SERVICES : [...DOCKER_SERVICES, ...LOCAL_SERVICES]);
  writeFiles(ctx);

  run('docker', ['compose', 'up', '-d', '--build', '--wait'], ctx);
  createBucket(ctx);
  if (!existsSync(path.join(ctx.root, 'node_modules'))) {
    run('pnpm', ['install', '--frozen-lockfile'], ctx);
  }
  // Le back compilé : la CLI (migrations, seed), l'API et le worker tournent sur `dist/`.
  run('pnpm', ['run', 'build:back'], ctx);
  run('pnpm', ['run', 'migrate'], ctx);
  run('pnpm', ['run', 'seed'], ctx);

  if (infraOnly) {
    console.log('\nDépendances prêtes, base migrée et semée.');
    return;
  }
  console.log('\nStack prête (Ctrl-C arrête l’API, le worker et le front) :');
  await printAddresses(ctx, false);
  await runForeground(ctx, {
    swc: ['run', 'dev:compiler'],
    api: ['run', 'dev:api'],
    worker: ['run', 'dev:worker'],
    front: ['--filter', './frontend', 'run', 'dev'],
  });
}

/** Lance les processus de dev, préfixe leurs sorties, et les arrête tous dès que l'un s'arrête. */
function runForeground(ctx: Context, processes: Record<string, string[]>): Promise<void> {
  return new Promise((resolve) => {
    const children: ChildProcess[] = [];
    let stopping = false;
    const stopAll = () => {
      if (stopping) return;
      stopping = true;
      for (const e of children) e.kill('SIGTERM');
    };
    let remaining = Object.keys(processes).length;
    for (const [name, args] of Object.entries(processes)) {
      const child = spawn('pnpm', args, { cwd: ctx.root, stdio: ['ignore', 'pipe', 'pipe'] });
      children.push(child);
      const prefix = `[${name}]`.padEnd(9);
      const relay = (stream: NodeJS.WritableStream) => (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) if (line) stream.write(`${prefix}${line}\n`);
      };
      child.stdout?.on('data', relay(process.stdout));
      child.stderr?.on('data', relay(process.stderr));
      child.on('exit', (code) => {
        if (!stopping) console.error(`${prefix}arrêté (code ${code}) : arrêt des autres processus.`);
        stopAll();
        if (--remaining === 0) resolve();
      });
    }
    process.on('SIGINT', stopAll);
    process.on('SIGTERM', stopAll);
  });
}

function stop(ctx: Context): void {
  run('docker', ['compose', 'down', '--remove-orphans'], ctx);
}

function destroy(ctx: Context, confirmed: boolean): void {
  if (!ctx.isWorktree && !confirmed) {
    throw new Error('Clone principal : la destruction efface la base locale. Relancer avec `pnpm destroy --yes`.');
  }
  run('docker', ['compose', 'down', '-v', '--remove-orphans'], ctx);
  console.log(`Stack et volumes de « ${ctx.project} » supprimés.`);
}

async function status(ctx: Context): Promise<void> {
  printContext(ctx);
  if (!existsSync(path.join(ctx.root, 'docker-compose.override.yaml'))) {
    console.log('Stack jamais démarrée ici (`pnpm start`).');
    return;
  }
  await printAddresses(ctx, true);
  run('docker', ['compose', 'ps', '--format', 'table {{.Service}}\t{{.Status}}'], ctx);
}

async function main(): Promise<void> {
  const [command, ...options] = process.argv.slice(2);
  const ctx = currentContext();
  switch (command) {
    case 'start':
      return start(ctx, options.includes('--infra'));
    case 'stop':
      return stop(ctx);
    case 'destroy':
      return destroy(ctx, options.includes('--yes'));
    case 'status':
      return status(ctx);
    default:
      throw new Error('Usage : node tools/stack/cli.ts start [--infra] | stop | destroy [--yes] | status');
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
