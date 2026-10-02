// Les commandes `study:*` de la CLI (F-02), de bout en bout sur la base de test, adresse et vignette
// calculées sur place (`--inline`) depuis les réponses enregistrées.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
const AY146 = '94046000AY0146';
let pool: pg.Pool;
let output: string[];
let errors: string[];
let dir: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  dir = await mkdtemp(path.join(tmpdir(), 'ardha-cli-'));
  const cli = await CommandTestFactory.createTestingCommand({ imports: [CliModule.forConfig(config)] }).compile();
  await seedParcels(cli, [AY96, AY97, AY146]);
  await cli.close();
});
afterAll(async () => {
  // `study:refresh` sans `--inline` laisse un job en file : on nettoie les files du test.
  const redis = new Redis(config.REDIS_URL);
  await dropKeys(redis, config.QUEUE_PREFIX);
  redis.disconnect();
  await pool.end();
  await rm(dir, { recursive: true, force: true });
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

it('study:create --inline, show, list, rename, address, parcelles, duplicate, thumbnail', async () => {
  const s = await json('study:create', '--user', 'Etude@Ardha.test', '--inline', AY96, AY97);
  expect(s).toMatchObject({ name: '6 Rue Pasteur, Maisons-Alfort (+1 parcelle)', addressPending: false, thumbnailPending: false, parcelCount: 2 });

  const shown = await run('study:show', s.id);
  expect(shown).toContain(`6 Rue Pasteur, Maisons-Alfort (+1 parcelle) — ${s.id}`);
  expect(shown).toContain('  adresse : 6 Rue Pasteur 94700 Maisons-Alfort');
  expect(shown).toContain('            ou 9 Rue Pasteur 94700 Maisons-Alfort [94046_7120_00009]');
  expect(shown).toContain('  contenance : 510 m² ; surface calculée : 507 m²');
  expect(shown).toContain('  étapes : Parcelles faite, Urbanisme à venir (L3)');

  expect(await run('study:list', '--user', 'etude@ardha.test')).toMatch(new RegExp(`^${s.id}\\t6 Rue Pasteur, Maisons-Alfort \\(\\+1 parcelle\\)\\tMaisons-Alfort · 2 parcelles · 510 m²\\tmodifiée le `));
  expect(await run('study:list', '-q', 'lyon')).toBe('Aucune étude.');

  expect(await run('study:rename', s.id, 'Angle', 'Pasteur')).toMatch(/^Angle Pasteur — /);
  expect(await run('study:address', s.id, '94046_7120_00009')).toContain('  adresse : 9 Rue Pasteur 94700 Maisons-Alfort');
  // Sans --inline, adresse et vignette attendent le worker.
  expect(await run('study:add-parcel', s.id, AY146)).toMatch(/adresse : en calcul[\s\S]*vignette : en calcul/);
  expect(await run('study:remove-parcel', s.id, AY146)).toContain('parcelles : AY 96 (94046000AY0096, 2026-09-01), AY 97');

  expect(await run('study:duplicate', s.id)).toMatch(/^Angle Pasteur \(copie\) — /);
  const copy = (JSON.parse(await run('study:list', '-q', 'copie', '--json')) as Study[])[0]!;
  const out = path.join(dir, 'vignette.png');
  expect(await run('study:thumbnail', copy.id, '--out', out)).toMatch(/vignette\.png : \d+ octets$/);
  expect((await readFile(out)).subarray(1, 4).toString()).toBe('PNG');
  expect(await run('study:refresh', s.id)).toBe('Adresse et vignette de « Angle Pasteur » confiées au worker.');
  expect(await run('study:refresh', s.id, '--inline')).toContain('  adresse : 9 Rue Pasteur 94700 Maisons-Alfort');
});

it('study:delete, list --trash, restore, purge', async () => {
  expect(await run('study:create', '--user', 'etude@ardha.test', AY146)).toMatch(/^Maisons-Alfort — AY 146 \(nom provisoire\) — /);
  const s = (JSON.parse(await run('study:list', '--json')) as Study[])[0]!;
  expect(await run('study:list')).toMatch(/\tMaisons-Alfort · 1 parcelle · 344 m²\t/);
  expect(await run('study:delete', s.id)).toMatch(/^Étude « Maisons-Alfort — AY 146 » mise à la corbeille ; purge le \d{2}\/\d{2}\/\d{4}/);
  expect(await run('study:list')).toBe('Aucune étude.');
  expect(await run('study:list', '--trash')).toContain('\tcorbeille, purge le ');
  expect(await run('study:restore', s.id)).toBe('Étude « Maisons-Alfort — AY 146 » restaurée.');
  await run('study:delete', s.id);
  expect(await run('study:purge')).toBe('0 étude(s) effacée(s).');
  expect(JSON.parse(await run('study:purge', '--days', '0', '--json'))).toEqual({ purged: [s.id] });
});

it('erreurs : auteur absent ou inconnu, étude inconnue', async () => {
  await run('study:create', AY146);
  await run('study:create', '--user', 'personne@ardha.test', AY146);
  await run('study:show', '0193a8b4-0000-7000-8000-000000000000');
  expect(errors.join('\n')).toMatch(/Indiquez l’auteur : --user <email>[\s\S]*Aucun compte avec l’adresse personne@ardha\.test[\s\S]*Étude introuvable\./);
  process.exitCode = 0;
});

it('risk:analyze --inline, risk:show, risk:commune, risk:point', async () => {
  const s = await json('study:create', '--user', 'etude@ardha.test', AY96, AY97);
  const analyzed = await run('risk:analyze', s.id, '--inline');
  // Le déroulé s'affiche au fil du calcul, puis le bilan.
  expect(analyzed).toMatch(/^ {2}… Risques de la commune : Maisons-Alfort \(Géorisques\)\n {2}✓ Risques de la commune : Maisons-Alfort \(Géorisques\) : radon 1 · sismicité 1 · 3 PPR/);
  expect(analyzed).toContain('  ✓ Altitudes de 23 points (IGN) : 23 altitudes reçues');
  expect(analyzed).toMatch(/\nAnalyse : prête, calculée le /);
  expect(analyzed).toContain('!!  Inondation : Aléa moyen');
  expect(analyzed).toContain('PPRI Marne et Seine [PPRN-I, 2 zone(s)]');
  expect(analyzed).toContain('TRI : aléa moyen ; moyen (centennal) plus de 2 m');
  expect(analyzed).toContain('cote indicative au moins 34.31 m NGF');
  expect(analyzed).toContain('bornes incendie à 400 m : 7, la plus proche à 111 m');
  const shown = JSON.parse(await run('risk:show', s.id, '--json')) as { status: string; result: { parcels: { point: [number, number] }[] } };
  expect(shown.status).toBe('ready');

  expect(await run('risk:commune', '94046')).toMatch(/^radon : classe 1 ; sismicité : zone 1\nGASPAR : Inondation, Transport de marchandises dangereuses\nPPRN PPRI Marne et Seine \(PPRN-I, 27\/02\/2025\) : 2 zone\(s\)/);
  const [lon, lat] = shown.result.parcels[0]!.point;
  const point = await run('risk:point', String(lon), String(lat));
  expect(point).toContain('argiles : moyen');
  expect(point).toContain('Débordement de cours d’eau, scénario moyen (centennal) : plus de 2 m');
  // Sans analyse, puis avec des sources muettes (AY146 : réponses des parcelles non enregistrées).
  const other = await json('study:create', '--user', 'etude@ardha.test', AY146);
  expect(await run('risk:show', other.id)).toBe('Analyse : jamais demandée');
  const muted = await run('risk:analyze', other.id, '--inline');
  expect(muted).toContain('?   Retrait-gonflement des argiles : Source indisponible : à vérifier');
  expect(muted).toMatch(/argiles : indisponible \(Réponse enregistrée absente/);
  // Les bornes viennent des cases déjà chargées pour l'étude voisine (cache).
  expect(muted).toMatch(/bornes incendie à 400 m : \d+, la plus proche/);
  expect(await run('parcel:elevation', AY96, AY97, '--inline')).toBe(
    ['Sélection : 31.88 à 32.55 m NGF, moyenne 32.2, dénivelé 0.67 m (23 points)', '  94046000AY0096 : 32.14 à 32.55 m NGF, moyenne 32.31, dénivelé 0.41 m (11 points)', '  94046000AY0097 : 31.88 à 32.3 m NGF, moyenne 32.09, dénivelé 0.42 m (12 points)', 'Source : IGN, RGE ALTI® (m NGF-IGN69, IGN78 en Corse)'].join('\n'),
  );
  await run('risk:point', 'x', '1');
  expect(errors.join('\n')).toContain('Point invalide : x 1');
  process.exitCode = 0;
});

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
