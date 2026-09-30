// Tests du back et des outils. Le front a les siens (`frontend/vitest.config.ts`).
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'outils', include: ['tools/**/*.test.ts'] },
      },
      {
        // swc pour les décorateurs et leurs métadonnées (injection de dépendances de Nest).
        plugins: [swc.vite({ jsc: { transform: { legacyDecorator: true, decoratorMetadata: true } } })],
        test: {
          name: 'back',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          globalSetup: ['test/preparer-base.ts'],
          // Une seule base de test par worktree : les fichiers s'exécutent l'un après l'autre.
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'tools/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/entrees/*/main.ts', 'tools/*/cli.ts', 'src/*/index.ts'],
      // Seuils à cliquet (PLAN §8) : `autoUpdate` les remonte quand la couverture progresse,
      // jamais ne les baisse ; la CI échoue en dessous. Au moins 90 % sur le domaine.
      thresholds: {
        autoUpdate: process.env.CI ? false : (seuil: number) => Math.floor(seuil),
        lines: 95,
        functions: 92,
        branches: 86,
        statements: 94,
        'src/domaine/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/contrats/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
