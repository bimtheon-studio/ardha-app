// Les commandes du marché de la CLI (F-05), de bout en bout sur la base de test, depuis les réponses
// enregistrées (Val-de-Marne 2024-2025, ECLN, Sitadel de Maisons-Alfort, indices INSEE). À part des
// commandes `study:*` : le chargement des ventes est le plus long, il tourne en parallèle.
import { CommandTestFactory } from 'nest-commander-testing';
import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { CliModule } from '../src/cli/cli.module.ts';
import type { Study } from '../src/contracts/index.ts';
import { testConfig } from './env.ts';
import { seedParcels } from './reference.ts';
import { dropKeys } from './test-app.ts';

const config = testConfig();
const AY96 = '94046000AY0096';
const AY97 = '94046000AY0097';
let pool: pg.Pool;
let output: string[];
let errors: string[];

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const cli = await CommandTestFactory.createTestingCommand({ imports: [CliModule.forConfig(config)] }).compile();
  await seedParcels(cli, [AY96, AY97]);
  await cli.close();
});
afterAll(async () => {
  // `market:analyze` sans `--inline` laisse un job en file : on nettoie les files du test.
  const redis = new Redis(config.REDIS_URL);
  await dropKeys(redis, config.QUEUE_PREFIX);
  redis.disconnect();
  await pool.end();
});
beforeEach(async () => {
  await pool.query('TRUNCATE users, audit_logs CASCADE');
  await pool.query(`INSERT INTO users (email, name) VALUES ('etude@ardha.test', 'Étude')`);
  output = [];
  errors = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((m: string | Uint8Array) => errors.push(String(m)) > 0);
  vi.spyOn(console, 'log').mockImplementation((...m: unknown[]) => void output.push(m.join(' ')));
});
afterEach(() => vi.restoreAllMocks());

async function run(...args: string[]): Promise<string> {
  output = [];
  const cli = await CommandTestFactory.createTestingCommand({ imports: [CliModule.forConfig(config)] }).compile();
  await CommandTestFactory.run(cli, args);
  return output.join('\n');
}
const json = async (...args: string[]) => JSON.parse(await run(...args, '--json')) as Study;

it('dvf:load, dvf:status, dvf:sales, market:analyze --inline, market:show, market:sales, ecln:load, index:load, sitadel:show', async () => {
  await pool.query('TRUNCATE dvf_mutations, new_build_prices, index_values, housing_permits');
  await pool.query(`DELETE FROM source_states WHERE source IN ('dvf', 'ecln', 'insee-bdm', 'sitadel')`);
  const plain = async (...args: string[]) => (await run(...args)).replace(/\u202f/g, ' ');

  expect(await plain('dvf:load', '94')).toBe('94 : 2024 (fichier du 2026-05-18), 2025 (fichier du 2026-05-18)\n  chargé(s) à l’instant : 2024, 2025');
  expect(await plain('dvf:load', '94')).toContain('  rien à recharger');
  expect(await plain('dvf:load', '94', '--year', '2025')).toBe('94 2025 : 19047 vente(s), fichier du 2026-05-18');
  expect(await plain('dvf:status', '94')).toMatch(/^94\/2024 {2}ready {6}16328 vente\(s\), fichier du 2026-05-18, vérifié le /);
  expect(JSON.parse(await run('dvf:status', '94', '--json')).counts).toEqual([{ year: 2024, mutations: 16_328 }, { year: 2025, mutations: 19_047 }]);
  expect(await plain('dvf:status', '75')).toBe('Aucune vente DVF en base.');
  const sales = await plain('dvf:sales', '2.42983', '48.79999', '--limit', '2');
  expect(sales).toMatch(/^332 vente\(s\) dans 500 m de 2\.42983, 48\.79999\n {2}2025-12-22 {3}327 m {2}apartment {6}545 000 € {2}92 m²/);
  expect(sales).toContain('  … 330 autre(s) (--limit)');
  expect(sales).toContain('  Appartements ancien : 5 465 €/m² (P25 4 948 €/m², P75 6 071 €/m², 131 vente(s), -1,3 % sur un an)');
  await run('dvf:sales', '1', '2', '--radius', '700');
  expect(errors.join('\n')).toContain('Rayon parmi 250, 500, 1000, 2000 m.');
  process.exitCode = 0;

  // Chaque source chargée une fois : d'abord à la main (« chargé à l'instant »), puis lue en base.
  expect(await plain('ecln:load')).toBe('ECLN : dernier trimestre 2026-T2, chargé à l’instant');
  expect(await plain('index:load')).toBe('Indices INSEE : chargés à l’instant');
  expect(await plain('sitadel:show', '94046')).toMatch(/^Sitadel 94046 : chargé à l’instant\n {2}2025 : 95 logement\(s\) autorisé\(s\), 0 commencé\(s\)/);
  expect(await plain('ecln:load')).toMatch(/^ECLN : dernier trimestre 2026-T2, en base depuis le /);
  expect(await plain('index:load')).toMatch(/^Indices INSEE : en base depuis le /);
  expect(await plain('sitadel:show', '94046')).toMatch(/^Sitadel 94046 : en base depuis le /);

  const s = await json('study:create', '--user', 'etude@ardha.test', AY96, AY97);
  const analyzed = await plain('market:analyze', s.id, '--inline');
  expect(analyzed).toMatch(/^ {2}… Départements du cercle\n {2}✓ Départements du cercle : Département 94, dans 500 m/);
  expect(analyzed).toContain('  ✓ Ventes DVF (DGFiP, Etalab) : 2024 à 2025, déjà en base');
  expect(analyzed).toMatch(/\nAnalyse de marché : prête, rayon 500 m, calculée le /);
  expect(analyzed).toContain('  DVF : 276 vente(s) comparable(s) sur 331, du 2024-01-12 au 2025-12-31 ; millésimes 94 2024, 2025');
  expect(analyzed).toContain('  Neuf (ECLN) : 2026-T2 collectif 5 739 €/m²');
  expect(analyzed).toContain('  Sitadel : 2025 95 autorisé(s)/0 commencé(s)');
  expect(analyzed).toContain('Indice du coût de la construction (ICC) 2 103 (2026-Q2, +0,8 % sur un an)');
  expect(await plain('market:analyze', s.id, '--radius', '1000')).toMatch(/^Analyse de marché : en file, rayon 1000 m/);
  expect(await plain('market:show', s.id)).toMatch(/^Analyse de marché : en file, rayon 1000 m/);
  expect(await plain('market:sales', s.id, '--type', 'house', '--limit', '1')).toMatch(/^77 vente\(s\) dans 1000 m de 2\.429934, 48\.800028\n {2}2025-12-15 {3}560 m {2}house/);
  expect(JSON.parse(await run('market:sales', s.id, '--segment', 'new', '--from', '2025', '--json')).sales.every((x: { vefa: boolean; date: string }) => x.vefa && x.date >= '2025')).toBe(true);
}, 20_000);
