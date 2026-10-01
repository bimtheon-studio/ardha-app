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
  expect(analyzed).toMatch(/^Analyse : prête, calculée le /);
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
  expect(muted).toMatch(/bornes incendie à 400 m : indisponible/);
  await run('risk:point', 'x', '1');
  expect(errors.join('\n')).toContain('Point invalide : x 1');
  process.exitCode = 0;
});
