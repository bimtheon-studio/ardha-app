// Le lanceur du conteneur, avec de faux processus (`node -e`) : migrations d'abord, puis API et
// worker ; worker relancé s'il tombe ; arrêt propre transmis ; l'API qui tombe arrête le conteneur.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { backoff, Launcher, type LauncherOptions, type ProcessSpec } from './launcher.ts';

let dir: string;
let logs: string[];
/** Lanceurs du test, arrêtés à la fin même s'il échoue : pas de faux processus orphelins. */
let started: Launcher[];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ardha-launcher-'));
  logs = [];
  started = [];
});
afterEach(() => {
  for (const l of started) l.stop('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
});

/** Un faux processus : note son passage dans `<dir>/<name>`, puis exécute `body`. */
function fake(name: string, body: string): ProcessSpec {
  const journal = JSON.stringify(path.join(dir, name));
  const script = `const fs = require('node:fs'); const note = (m) => fs.appendFileSync(${journal}, m + '\\n'); note('start'); ${body}`;
  return { name, command: process.execPath, args: ['-e', script] };
}

/** Reste en vie ; à SIGTERM, note « term » et sort proprement. */
const SERVES = `process.on('SIGTERM', () => { note('term'); process.exit(0); }); setInterval(() => {}, 1000);`;

function journal(name: string): string[] {
  try {
    return readFileSync(path.join(dir, name), 'utf8').trim().split('\n');
  } catch {
    return [];
  }
}

function launcher(options: Partial<LauncherOptions>): Launcher {
  const l = new Launcher({
    migrate: fake('migrate', 'process.exit(0);'),
    api: fake('api', SERVES),
    worker: fake('worker', SERVES),
    stopTimeoutMs: 2_000,
    restartDelayMs: () => 50,
    log: (m) => logs.push(m),
    ...options,
  });
  started.push(l);
  return l;
}

async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > end) throw new Error(`condition non atteinte ; journal : ${logs.join(' | ')}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('lanceur du conteneur', () => {
  it('joue les migrations, puis démarre l’API et le worker ; SIGTERM les arrête proprement', async () => {
    const l = launcher({});
    const exit = l.start();
    await until(() => journal('api').includes('start') && journal('worker').includes('start'));
    expect(journal('migrate')).toEqual(['start']);
    l.stop('SIGTERM');
    expect(await exit).toBe(0);
    expect(journal('api')).toEqual(['start', 'term']);
    expect(journal('worker')).toEqual(['start', 'term']);
  });

  it('ne démarre rien si les migrations échouent', async () => {
    const code = await launcher({ migrate: fake('migrate', 'process.exit(3);') }).start();
    expect(code).toBe(1);
    expect(journal('api')).toEqual([]);
    expect(journal('worker')).toEqual([]);
    expect(logs.join('\n')).toMatch(/migrations en échec/);
  });

  it('relance le worker qui tombe, sans toucher à l’API', async () => {
    // Tombe deux fois, puis tient.
    const worker = fake('worker', `const n = require('node:fs').readFileSync(${JSON.stringify(path.join(dir, 'worker'))}, 'utf8').split('\\n').length - 1; if (n < 3) process.exit(1); ${SERVES}`);
    const l = launcher({ worker });
    const exit = l.start();
    await until(() => journal('worker').length >= 3 && journal('api').includes('start'));
    expect(journal('api')).toEqual(['start']);
    expect(logs.filter((m) => /worker arrêté \(code 1\), relance/.test(m))).toHaveLength(2);
    l.stop('SIGTERM');
    expect(await exit).toBe(0);
  });

  it('arrête le conteneur si l’API tombe : le worker est arrêté, le code de sortie remonte', async () => {
    const api = fake('api', 'setTimeout(() => process.exit(4), 200);');
    const code = await launcher({ api }).start();
    expect(code).toBe(4);
    expect(journal('worker')).toEqual(['start', 'term']);
    expect(logs.join('\n')).toMatch(/API arrêtée \(code 4\)/);
  });

  it('tue un processus qui ne s’arrête pas dans le délai', async () => {
    const stubborn = fake('worker', `process.on('SIGTERM', () => note('term ignoré')); setInterval(() => {}, 1000);`);
    const l = launcher({ worker: stubborn, stopTimeoutMs: 300 });
    const exit = l.start();
    await until(() => journal('worker').includes('start'));
    l.stop('SIGTERM');
    expect(await exit).toBe(0);
    expect(journal('worker')).toEqual(['start', 'term ignoré']);
    expect(logs.join('\n')).toMatch(/worker ne s’arrête pas : SIGKILL/);
  });

  it('lance le seed après le démarrage de l’API ; un seed en échec n’arrête pas le conteneur', async () => {
    const l = launcher({ seed: fake('seed', 'process.exit(2);') });
    const exit = l.start();
    // L'API aussi : un faux processus met quelques dizaines de millisecondes à démarrer (CI).
    await until(() => logs.some((m) => /seed en échec \(code 2\)/.test(m)) && journal('api').includes('start'));
    expect(journal('seed')).toEqual(['start']);
    l.stop('SIGTERM');
    expect(await exit).toBe(0);
    expect(journal('api')).toEqual(['start', 'term']);
  });

  it('un arrêt pendant les migrations les interrompt et ne démarre rien', async () => {
    const l = launcher({ migrate: fake('migrate', SERVES) });
    const exit = l.start();
    await until(() => journal('migrate').includes('start'));
    l.stop('SIGTERM');
    expect(await exit).toBe(0);
    expect(journal('api')).toEqual([]);
  });
});

describe('lanceur : cas limites', () => {
  it('une API qui sort « proprement » sans qu’on l’ait demandé arrête quand même le conteneur, en erreur', async () => {
    const code = await launcher({ api: fake('api', 'setTimeout(() => process.exit(0), 100);') }).start();
    expect(code).toBe(1);
  });

  it('un worker tué par un signal est relancé', async () => {
    const worker = fake('worker', `if (require('node:fs').readFileSync(${JSON.stringify(path.join(dir, 'worker'))}, 'utf8').split('\\n').length < 3) process.kill(process.pid, 'SIGKILL'); ${SERVES}`);
    const l = launcher({ worker });
    const exit = l.start();
    await until(() => journal('worker').length >= 2);
    expect(logs.join('\n')).toMatch(/worker arrêté \(code SIGKILL\)/);
    l.stop('SIGTERM');
    l.stop('SIGINT');
    expect(await exit).toBe(0);
    expect(logs.filter((m) => /reçu : arrêt/.test(m))).toEqual(['SIGTERM reçu : arrêt']);
  });

  it('les échecs consécutifs allongent l’attente ; un worker resté stable repart de la première', async () => {
    const attempts = async (stableAfterMs: number) => {
      const seen: number[] = [];
      const l = launcher({
        worker: fake('worker', 'process.exit(1);'),
        stableAfterMs,
        restartDelayMs: (n) => (seen.push(n), 10),
      });
      const exit = l.start();
      await until(() => seen.length >= 3);
      l.stop('SIGTERM');
      await exit;
      return seen.slice(0, 3);
    };
    expect(await attempts(60_000)).toEqual([1, 2, 3]);
    expect(await attempts(0)).toEqual([1, 1, 1]);
  });

  it('l’API qui tombe pendant l’attente d’une relance du worker arrête tout, sans relance', async () => {
    const l = launcher({
      api: fake('api', 'setTimeout(() => process.exit(5), 300);'),
      worker: fake('worker', 'process.exit(1);'),
      restartDelayMs: () => 10_000,
    });
    expect(await l.start()).toBe(5);
    expect(journal('worker')).toEqual(['start']);
  });
});

describe('délai de relance du worker', () => {
  it('double à chaque échec consécutif, plafonné à 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(backoff)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
  });
});
