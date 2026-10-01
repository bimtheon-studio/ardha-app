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

function run(command: string, args: string[], options: { input?: NodeJS.ReadableStream | string } = {}): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: [options.input !== undefined ? 'pipe' : 'inherit', 'inherit', 'inherit'] });
    if (typeof options.input === 'string') child.stdin?.end(options.input);
    else if (options.input && child.stdin) options.input.pipe(child.stdin);
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
}

/** Secret demandé sans écho sur un terminal, sinon lu sur l'entrée standard (première ligne). */
async function readSecret(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0]!.trim();
  }
  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  try {
    for await (const chunk of stdin) {
      for (const ch of (chunk as Buffer).toString('utf8')) {
        if (ch === '\u0003') throw new Error('Interrompu.');
        if (ch === '\r' || ch === '\n') return value.trim();
        value = ch === '\u007f' ? value.slice(0, -1) : value + ch;
      }
    }
    return value.trim();
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    process.stderr.write('\n');
  }
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
    case 'remote': {
      const command = [...(action.tty ? ['-t'] : []), SERVER, ['ardha/ardha-env', ...action.args].map(shellQuote).join(' ')];
      if (action.secret === undefined) return run(SSH, command);
      return run(SSH, command, { input: `${await readSecret(action.secret)}\n` });
    }
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
