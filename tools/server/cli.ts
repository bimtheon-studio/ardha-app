// `pnpm server …` : piloter et déboguer les environnements d'Ardha sur le serveur once (lot LD).
// Copie les fichiers du serveur (`deploy/server`, `docker/postgres`) dans `~/ardha`, puis appelle
// `~/ardha/ardha-env` par SSH ; construit et publie l'image du commit courant. Aucune action
// distante sans commande explicite. Serveur : `ARDHA_SERVER` (par défaut ubuntu@ssh.once.florent.cc).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

import { type Action, plan, shellQuote } from './plan.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SERVER = process.env.ARDHA_SERVER ?? 'ubuntu@ssh.once.florent.cc';
const SSH = process.env.ARDHA_SSH ?? 'ssh';
const REPOSITORY = process.env.ARDHA_IMAGE_REPOSITORY ?? 'ghcr.io/bimtheon-studio/ardha';

const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

function run(command: string, args: string[], options: { input?: NodeJS.ReadableStream } = {}): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: [options.input ? 'pipe' : 'inherit', 'inherit', 'inherit'] });
    if (options.input && child.stdin) options.input.pipe(child.stdin);
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
}

async function sync(): Promise<number> {
  console.log(`Copie des fichiers du serveur vers ${SERVER}:~/ardha …`);
  const tar = spawn('tar', ['-c', '-C', 'deploy/server', 'compose.yaml', 'ardha-env', '-C', path.join(ROOT, 'docker'), 'postgres'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return run(SSH, [SERVER, 'mkdir -p ardha && chmod 700 ardha && tar -x -C ardha'], { input: tar.stdout });
}

async function execute(action: Action): Promise<number> {
  switch (action.kind) {
    case 'sync':
      return sync();
    case 'build':
      console.log(`Construction de ${action.image} …`);
      return run('docker', ['build', '--tag', action.image, '.']);
    case 'push':
      console.log(`Publication de ${action.image} …`);
      return run('docker', ['push', action.image]);
    case 'remote':
      return run(SSH, [...(action.tty ? ['-t'] : []), SERVER, ['ardha/ardha-env', ...action.args].map(shellQuote).join(' ')]);
  }
}

try {
  const actions = plan(process.argv.slice(2), {
    repository: REPOSITORY,
    sha: git('rev-parse', 'HEAD'),
    dirty: spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim() !== '',
    tty: Boolean(process.stdin.isTTY),
  });
  for (const action of actions) {
    const code = await execute(action);
    if (code !== 0) {
      process.exitCode = code;
      break;
    }
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 2;
}
