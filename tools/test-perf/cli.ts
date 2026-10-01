// `pnpm test:perf [--e2e] [--record]` : lance les suites sans couverture, chronomètre, et affiche
// les fichiers et tests les plus lents. `--e2e` ajoute Playwright ; `--record` consigne la mesure
// dans docs/reecriture/PERF-TESTS.md, pour suivre l'évolution lot après lot.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPlaywright, fromVitest, historyLine, render, type SuiteTiming } from './summary.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HISTORY = path.join(ROOT, 'docs/reecriture/PERF-TESTS.md');
const options = new Set(process.argv.slice(2));
const dir = mkdtempSync(path.join(tmpdir(), 'ardha-perf-'));

function timed(command: string, args: string[], env: NodeJS.ProcessEnv = {}): number {
  const start = performance.now();
  // Les échecs sont comptés dans le rapport ; on mesure quand même.
  spawnSync(command, args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CI: '1', ...env } });
  return performance.now() - start;
}

const suites: SuiteTiming[] = [];
try {
  const back = path.join(dir, 'back.json');
  const backMs = timed('pnpm', ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${back}`]);
  suites.push(fromVitest('back+outils', backMs, JSON.parse(readFileSync(back, 'utf8')), ROOT));

  const front = path.join(dir, 'front.json');
  const frontMs = timed('pnpm', ['--filter', './frontend', 'exec', 'vitest', 'run', '--reporter=json', `--outputFile=${front}`]);
  suites.push(fromVitest('front', frontMs, JSON.parse(readFileSync(front, 'utf8')), path.join(ROOT, 'frontend')));

  if (options.has('--e2e')) {
    const e2e = path.join(dir, 'e2e.json');
    const e2eMs = timed('pnpm', ['exec', 'playwright', 'test', '--reporter=json'], { PLAYWRIGHT_JSON_OUTPUT_NAME: e2e });
    if (existsSync(e2e)) suites.push(fromPlaywright('e2e', e2eMs, JSON.parse(readFileSync(e2e, 'utf8'))));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(render(suites));
if (options.has('--record')) {
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const date = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
  appendFileSync(HISTORY, `${historyLine(date, commit, suites)}\n`);
  console.log(`\nMesure consignée dans ${path.relative(ROOT, HISTORY)}.`);
}
if (suites.some((s) => s.failed > 0)) process.exitCode = 1;
