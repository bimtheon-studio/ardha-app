import { defineConfig, mergeConfig } from 'vitest/config';

import vite from './vite.config.ts';

export default mergeConfig(
  vite,
  defineConfig({
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        // Les primitives shadcn/ui sont du code de bibliothèque repris tel quel (PLAN §5) ; le rendu
        // Leaflet (`src/map/leaflet`) ne se dessine pas dans happy-dom : il est couvert par l'e2e.
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/components/ui/**', 'src/map/leaflet/**'],
        // Seuils à cliquet : `autoUpdate` les remonte en local, la CI échoue en dessous.
        thresholds: { autoUpdate: process.env.CI ? false : (threshold: number) => Math.floor(threshold), lines: 99, functions: 98, branches: 95, statements: 98 },
      },
    },
  }),
);
