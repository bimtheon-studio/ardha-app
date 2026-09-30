// Front (Vite). Ports et API lus dans `.env.local` à la racine (généré par `pnpm start`, aux
// ports du worktree) : `/api` est relayé vers l'API, le cookie de session reste de même origine.
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const racine = path.resolve(import.meta.dirname, '..');

// `.env` et `.env.local` de la racine, sans préfixe : seule la configuration du serveur les lit.
const env = loadEnv('', racine, '');
const portWeb = Number(env.WEB_PORT ?? 14000);
const portApi = Number(env.API_PORT ?? 13000);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: racine,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // Seuls points de contact avec le back : le contrat et les règles pures (voir eslint.config.js).
      '@contrats': path.resolve(racine, 'src/contrats/index.ts'),
      '@domaine': path.resolve(racine, 'src/domaine/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: portWeb,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${portApi}`, xfwd: true } },
  },
  preview: { host: '127.0.0.1', port: portWeb, strictPort: true },
});
