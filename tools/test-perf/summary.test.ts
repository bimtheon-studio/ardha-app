import { describe, expect, it } from 'vitest';

import { fromPlaywright, fromVitest, historyLine, render } from './summary.ts';

const vitest = {
  testResults: [
    { name: '/r/test/a.test.ts', assertionResults: [{ fullName: 'a lent', duration: 900, status: 'passed' }, { fullName: 'a vite', duration: 5, status: 'passed' }] },
    { name: '/r/src/b.test.ts', assertionResults: [{ fullName: 'b', duration: null, status: 'failed' }] },
  ],
};

const playwright = {
  suites: [
    {
      title: 'map.spec.ts',
      file: 'map.spec.ts',
      specs: [{ title: 'chercher', tests: [{ results: [{ duration: 4000, status: 'passed' }] }] }],
      suites: [{ title: 'sur mobile', specs: [{ title: 'toucher', tests: [{ results: [{ duration: 100, status: 'failed' }, { duration: 2000, status: 'passed' }] }] }] }],
    },
    { title: 'auth.spec.ts', specs: [{ title: 'vide', tests: [{ results: [] }] }] },
  ],
};

describe('performance des tests', () => {
  it('lit Vitest : fichiers relatifs, durées absentes à 0, échecs comptés', () => {
    const s = fromVitest('back', 1234, vitest, '/r');
    expect(s).toMatchObject({ suite: 'back', wallMs: 1234, files: 2, tests: 3, failed: 1 });
    expect(s.timings[2]).toEqual({ file: 'src/b.test.ts', name: 'b', ms: 0 });
  });

  it('lit Playwright : suites imbriquées, dernière tentative retenue', () => {
    const s = fromPlaywright('e2e', 17_000, playwright);
    expect(s).toMatchObject({ tests: 3, files: 2, failed: 0 });
    expect(s.timings.map((t) => [t.file, t.name, t.ms])).toEqual([
      ['map.spec.ts', 'chercher', 4000],
      ['map.spec.ts', 'sur mobile › toucher', 2000],
      ['auth.spec.ts', 'vide', 0],
    ]);
    const failing = fromPlaywright('e2e', 1, { suites: [{ title: 'x', specs: [{ title: 't', tests: [{ results: [{ duration: 1, status: 'timedOut' }] }] }] }] });
    expect(failing.failed).toBe(1);
  });

  it('rend suites, fichiers et tests les plus lents, et une ligne de journal', () => {
    const suites = [fromVitest('back', 7_100, vitest, '/r'), fromPlaywright('e2e', 17_000, playwright)];
    const text = render(suites, 2);
    expect(text).toMatch(/^Suite\s+Tests\s+Fichiers\s+Échecs\s+Durée/);
    expect(text).toMatch(/Total\s+6\s+24,1 s/);
    expect(text).toMatch(/Fichiers les plus lents[^\n]*\n\s+e2e\s+map\.spec\.ts\s+2 tests\s+6,0 s\n\s+back\s+test\/a\.test\.ts\s+2 tests\s+0,9 s/);
    expect(text).toMatch(/Tests les plus lents[^\n]*\n\s+e2e\s+map\.spec\.ts › chercher\s+4,0 s/);
    expect(historyLine('01/10/2026 09:00', 'abc1234', suites)).toBe('| 01/10/2026 09:00 | `abc1234` | back 3 en 7,1 s · e2e 3 en 17,0 s | 24,1 s |');
  });
});
