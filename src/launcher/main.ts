// Point d'entrée du conteneur de production (Dockerfile) : voir `launcher.ts`.
import path from 'node:path';

import { readConfig } from '../config/config.ts';
import { backoff, Launcher, type ProcessSpec } from './launcher.ts';

// Configuration vérifiée tout de suite : une variable manquante arrête le conteneur avec un message clair.
const config = readConfig();

const dist = path.resolve(import.meta.dirname, '..');
const node = (name: string, script: string, ...args: string[]): ProcessSpec => ({
  name,
  command: process.execPath,
  args: ['--enable-source-maps', path.join(dist, script), ...args],
});

const launcher = new Launcher({
  migrate: node('migrations', 'cli/main.js', 'migrate'),
  api: node('API', 'routes/main.js'),
  worker: node('worker', 'worker/main.js'),
  ...(config.ARDHA_SEED_ON_BOOT && { seed: node('seed', 'cli/main.js', 'seed', '--if-empty') }),
  stopTimeoutMs: 8_000,
  restartDelayMs: backoff,
  log: (message) => console.log(JSON.stringify({ level: 30, time: Date.now(), name: 'launcher', msg: message })),
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => launcher.stop(signal));
process.exitCode = await launcher.start();
