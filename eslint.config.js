// Lint du dépôt. Au-delà du style, il tient les frontières de l'architecture :
//  - le domaine (`src/domain`) est pur : aucun import hors de son dossier ;
//  - le contrat (`src/contracts`) ne dépend que du domaine et de zod ;
//  - Drizzle ne sort pas de `src/db` et des repositories (D-06) ;
//  - seuls le worker et la CLI touchent aux sources publiques (`src/sources`, `src/ingestion`) :
//    l'API ne sort jamais (PLAN §3), et `fetch` n'existe que dans `src/sources/http.ts` ;
//  - le front n'importe du back que le contrat et le domaine (`@contracts`, `@domain`).
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const restrict = (...motifs) => ['error', { patterns: motifs }];

const DRIZZLE = { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Drizzle reste dans src/db et les repositories (D-06).' };
const SOURCES = {
  group: ['**/sources/*', '**/ingestion/*'],
  message: 'Seuls le worker et la CLI appellent les sources publiques (PLAN §3) : l’API dépose un job.',
};
/** Ce qui a le droit de sortir vers l'extérieur, ou de piloter ce qui sort. */
const OUTBOUND = ['src/worker/**/*.ts', 'src/cli/**/*.ts', 'src/ingestion/**/*.ts', 'src/sources/**/*.ts'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'node_modules/**', 'frontend/node_modules/**', 'docs/**', 'tools/inventaire-ancien.mjs', 'tools/rendre-inventaire.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Nest injecte par le type des paramètres du constructeur : ces imports doivent rester des valeurs.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  { files: ['**/*.js', 'drizzle.config.ts'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/db/**', 'src/**/*.repository.ts', 'src/**/*.test.ts', ...OUTBOUND],
    rules: { 'no-restricted-imports': restrict(DRIZZLE, SOURCES) },
  },
  {
    files: OUTBOUND,
    ignores: ['src/**/*.repository.ts', 'src/**/*.test.ts'],
    rules: { 'no-restricted-imports': restrict(DRIZZLE) },
  },
  {
    files: ['src/db/**/*.ts', 'src/**/*.repository.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: { 'no-restricted-imports': restrict(SOURCES) },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/sources/http.ts', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Les appels sortants passent par Http (src/sources/http.ts), depuis le worker.' }],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrict({
        regex: '^(?!\\./)',
        message: 'Le domaine est pur : ni framework, ni base, ni import hors de src/domain.',
      }),
    },
  },
  {
    files: ['src/contracts/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrict({
        regex: '^(?!\\./|\\.\\./domain/|zod$)',
        message: 'Le contrat ne dépend que de src/domain et de zod : le front l’importe.',
      }),
    },
  },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': restrict({
        regex: '^\\.\\./',
        message: 'Du back, le front n’importe que @contracts et @domain ; dans le front, utiliser @/.',
      }),
    },
  },
  {
    // Primitives shadcn/ui reprises telles quelles (PLAN §5) : on ne les reformate pas.
    files: ['frontend/src/components/ui/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off', '@typescript-eslint/no-empty-object-type': 'off' },
  },
);
