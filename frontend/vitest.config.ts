import { defineConfig, mergeConfig } from 'vitest/config';

import vite from './vite.config.ts';

export default mergeConfig(
  vite,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        // Les primitives shadcn/ui sont du code de bibliothèque repris tel quel (PLAN §5).
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/components/ui/**'],
        // Seuils à cliquet : `autoUpdate` les remonte en local, la CI échoue en dessous.
        thresholds: { autoUpdate: process.env.CI ? false : (threshold: number) => Math.floor(threshold), lines: 97, functions: 93, branches: 94, statements: 96 },
      },
    },
  }),
);
