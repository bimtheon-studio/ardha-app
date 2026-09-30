// Tests e2e (Playwright) : le parcours réel dans Chromium, contre une stack jetable (e2e/stack.ts),
// sans Internet (sources enregistrées, tuiles IGN servies par le test).
import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

import { e2eEnv } from './e2e/env.ts';

const { web } = e2eEnv();
// Le Chromium du système s'il existe (poste de développement), sinon celui de Playwright (CI).
const chromium = process.env.ARDHA_CHROMIUM ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${web}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    ...(chromium && { launchOptions: { executablePath: chromium } }),
  },
  webServer: {
    command: 'node e2e/stack.ts',
    // Par le front : répond quand le front et, derrière lui, l’API sont prêts.
    url: `http://127.0.0.1:${web}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
