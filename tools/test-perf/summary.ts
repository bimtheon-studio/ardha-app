// Performance des tests : lit les rapports JSON de Vitest et de Playwright, et en tire durée par
// suite, fichiers et tests les plus lents. La base de tests grossit vite : on la mesure à chaque
// lot (consigne du porteur du produit, 01/10/2026).
import path from 'node:path';

export interface TestTiming {
  file: string;
  name: string;
  ms: number;
}

export interface SuiteTiming {
  suite: string;
  /** Durée mesurée de bout en bout (démarrage, préparation et tests). */
  wallMs: number;
  files: number;
  tests: number;
  failed: number;
  timings: TestTiming[];
}

interface VitestReport {
  testResults: {
    name: string;
    assertionResults: { fullName: string; duration?: number | null; status: string }[];
  }[];
}

export function fromVitest(suite: string, wallMs: number, report: VitestReport, root: string): SuiteTiming {
  const timings = report.testResults.flatMap((f) =>
    f.assertionResults.map((t) => ({ file: path.relative(root, f.name), name: t.fullName, ms: t.duration ?? 0 })),
  );
  return {
    suite,
    wallMs,
    files: report.testResults.length,
    tests: timings.length,
    failed: report.testResults.flatMap((f) => f.assertionResults).filter((t) => t.status === 'failed').length,
    timings,
  };
}

interface PlaywrightSuite {
  file?: string;
  title: string;
  specs?: { title: string; file?: string; tests: { results: { duration: number; status: string }[] }[] }[];
  suites?: PlaywrightSuite[];
}

export function fromPlaywright(suite: string, wallMs: number, report: { suites: PlaywrightSuite[] }): SuiteTiming {
  const timings: TestTiming[] = [];
  let failed = 0;
  const walk = (s: PlaywrightSuite, file: string, prefix: string[]) => {
    const f = s.file ?? file;
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests) {
        const last = t.results.at(-1);
        if (last && last.status !== 'passed' && last.status !== 'skipped') failed++;
        timings.push({ file: f, name: [...prefix, spec.title].join(' › '), ms: last?.duration ?? 0 });
      }
    }
    for (const child of s.suites ?? []) walk(child, f, child.file ? prefix : [...prefix, child.title]);
  };
  for (const s of report.suites) walk(s, s.file ?? s.title, []);
  return { suite, wallMs, files: report.suites.length, tests: timings.length, failed, timings };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

function table(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  ').trimEnd());
}

/** Rapport lisible : suites, puis fichiers et tests les plus lents. */
export function render(suites: SuiteTiming[], top = 10): string {
  const all = suites.flatMap((s) => s.timings.map((t) => ({ ...t, suite: s.suite })));
  const byFile = new Map<string, { suite: string; ms: number; tests: number }>();
  for (const t of all) {
    const key = `${t.suite}\u0000${t.file}`;
    const e = byFile.get(key) ?? { suite: t.suite, ms: 0, tests: 0 };
    byFile.set(key, { ...e, ms: e.ms + t.ms, tests: e.tests + 1 });
  }
  const files = [...byFile.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, top);
  const tests = [...all].sort((a, b) => b.ms - a.ms).slice(0, top);
  const total = suites.reduce((n, s) => n + s.wallMs, 0);
  return [
    ...table([
      ['Suite', 'Tests', 'Fichiers', 'Échecs', 'Durée'],
      ...suites.map((s) => [s.suite, String(s.tests), String(s.files), String(s.failed), seconds(s.wallMs)]),
      ['Total', String(suites.reduce((n, s) => n + s.tests, 0)), '', '', seconds(total)],
    ]),
    '',
    `Fichiers les plus lents (somme de leurs tests) :`,
    ...table(files.map(([key, f]) => [`  ${f.suite}`, key.split('\u0000')[1]!, `${f.tests} tests`, seconds(f.ms)])),
    '',
    `Tests les plus lents :`,
    ...table(tests.map((t) => [`  ${t.suite}`, `${t.file} › ${t.name}`.slice(0, 110), seconds(t.ms)])),
  ].join('\n');
}

/** Une ligne du journal de performance (`docs/reecriture/PERF-TESTS.md`). */
export function historyLine(date: string, commit: string, suites: SuiteTiming[]): string {
  const cells = suites.map((s) => `${s.suite} ${s.tests} en ${seconds(s.wallMs)}`);
  return `| ${date} | \`${commit}\` | ${cells.join(' · ')} | ${seconds(suites.reduce((n, s) => n + s.wallMs, 0))} |`;
}
