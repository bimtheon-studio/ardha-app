// Test de l'image de production (`pnpm test:image`) : construit l'image et la démarre contre la stack
// du worktree. Hors de `pnpm test` : un build Docker n'a pas sa place dans la boucle rapide.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'image',
    include: ['test/image/**/*.test.ts'],
    // Les étapes se suivent sur le même conteneur.
    sequence: { concurrent: false },
    hookTimeout: 300_000,
  },
});
