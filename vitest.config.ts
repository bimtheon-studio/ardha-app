// Tests du back et des outils. Le front a les siens (`frontend/vitest.config.ts`).
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// swc pour les décorateurs et leurs métadonnées (injection de dépendances de Nest).
const nestSwc = swc.vite({ jsc: { transform: { legacyDecorator: true, decoratorMetadata: true } } });

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'outils', include: ['tools/**/*.test.ts'] },
      },
      {
        plugins: [nestSwc],
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        plugins: [nestSwc],
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          // Le déploiement a son propre passage (`pnpm test:deploy`, vitest.deploy.config.ts) : build Docker, lent.
          exclude: ['test/deploy/**'],
          globalSetup: ['test/setup-db.ts'],
          // Une base par worker, clonée de la base modèle : les fichiers tournent en parallèle.
          setupFiles: ['test/worker-db.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'tools/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/{routes,worker,cli,launcher}/main.ts', 'tools/*/cli.ts', 'src/*/index.ts'],
      // Seuils à cliquet (PLAN §8) : `autoUpdate` les remonte quand la couverture progresse,
      // jamais ne les baisse ; la CI échoue en dessous. Au moins 90 % sur le domaine.
      thresholds: {
        autoUpdate: process.env.CI ? false : (threshold: number) => Math.floor(threshold),
        lines: 97,
        functions: 95,
        branches: 88,
        statements: 96,
        'src/domain/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/contracts/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
