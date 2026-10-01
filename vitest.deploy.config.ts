// Tests du déploiement (`pnpm test:deploy`) : l'image de production, démarrée contre la stack du
// worktree, et le script serveur `ardha-env` avec un faux once qui lance cette image. Hors de
// `pnpm test` : un build Docker n'a pas sa place dans la boucle rapide.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'deploy',
    include: ['test/deploy/**/*.test.ts'],
    globalSetup: ['test/deploy/build-image.ts'],
    // Des conteneurs et une stack par fichier : un fichier à la fois, des étapes qui se suivent.
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 300_000,
    testTimeout: 120_000,
  },
});
