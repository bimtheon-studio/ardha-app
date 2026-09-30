// drizzle-kit ne sert qu'à générer les migrations SQL (`pnpm migration:generate`), jamais à les
// appliquer : c'est la commande `migrate` de la CLI qui le fait (et la CD en production).
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
});
