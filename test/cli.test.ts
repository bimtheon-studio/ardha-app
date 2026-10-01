// Les commandes de la CLI, de bout en bout sur la base de test.
import { CommandTestFactory } from 'nest-commander-testing';
import { Readable } from 'node:stream';

import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CliModule } from '../src/cli/cli.module.ts';
import { REFERENCE_COMMUNES } from '../src/ingestion/reference-seed.ts';
import { testConfig } from './env.ts';

const config = testConfig();
let pool: pg.Pool;
let output: string[];
let errors: string[];

beforeAll(() => {
  pool = new pg.Pool({ connectionString: config.DATABASE_URL });
});
afterAll(() => pool.end());
beforeEach(async () => {
  await pool.query('TRUNCATE users, sessions, password_resets, audit_logs CASCADE');
  output = [];
  errors = [];
  // nest-commander écrit l'erreur d'une commande sur la sortie d'erreur (en production : `report`, cli/main.ts).
  vi.spyOn(process.stderr, 'write').mockImplementation((m: string | Uint8Array) => errors.push(String(m)) > 0);
  vi.spyOn(console, 'log').mockImplementation((...m: unknown[]) => void output.push(m.join(' ')));
});
afterEach(() => vi.restoreAllMocks());

/** Comme en production, chaque commande a sa propre application, fermée à la fin de la commande. */
async function run(...args: string[]): Promise<void> {
  const cli = await CommandTestFactory.createTestingCommand({ imports: [CliModule.forConfig(config)] }).compile();
  await CommandTestFactory.run(cli, args);
}

describe('CLI', () => {
  it('migrate est idempotent ; seed charge une commune de référence une fois', async () => {
    await pool.query(`DELETE FROM source_states WHERE scope = '37023'`);
    await run('migrate');
    await run('seed', '37023');
    await run('seed', '37023');
    expect(output).toEqual([
      'Migrations à jour.',
      'Seed : Beaumont-Village (37023) chargée, 1145 parcelles, millésime 2026-09-01.',
      'Seed : Beaumont-Village (37023) déjà à jour, 1145 parcelles, millésime 2026-09-01.',
    ]);
    // Sans argument, les quatre communes de référence (rejoué en entier par l'e2e et `pnpm start`).
    expect(REFERENCE_COMMUNES).toEqual(['94046', '74010', '37261', '37023']);
  });

  it('seed --if-empty : ne fait rien sur une base déjà semée, sème une base vide (environnements de PR)', async () => {
    await run('seed', '37023');
    output = [];
    await run('seed', '--if-empty', '37023');
    expect(output).toEqual(['Seed : base déjà semée, rien à faire.']);
    await pool.query('TRUNCATE communes, parcels, source_states CASCADE');
    output = [];
    await run('seed', '--if-empty', '37023');
    expect(output).toEqual(['Seed : Beaumont-Village (37023) chargée, 1145 parcelles, millésime 2026-09-01.']);
  });

  it('user:set-password : mot de passe lu sur l’entrée standard, règle appliquée, sessions fermées', async () => {
    const withStdin = async (input: string, ...args: string[]) => {
      const original = Object.getOwnPropertyDescriptor(process, 'stdin')!;
      Object.defineProperty(process, 'stdin', { value: Readable.from([Buffer.from(input)]), configurable: true });
      try {
        await run(...args);
      } finally {
        Object.defineProperty(process, 'stdin', original);
      }
    };
    await run('user:create-admin', '-e', 'recette@ardha.test', '-n', 'Recette');
    const id = (await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = 'recette@ardha.test'`)).rows[0]!.id;
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, absolute_expires_at) VALUES ($1, 'x', now() + interval '1 day', now() + interval '1 day')`,
      [id],
    );
    output = [];
    await withStdin('court\n', 'user:set-password', '-e', 'recette@ardha.test', '--password-stdin');
    expect(errors.join('')).toMatch(/au moins 12 caractères/);
    await withStdin('cheval pomme agrafe\n', 'user:set-password', '-e', 'recette@ardha.test', '--password-stdin');
    expect(output).toEqual(['Mot de passe défini pour recette@ardha.test ; 1 session(s) fermée(s).']);
    const r = await pool.query(`SELECT password_hash IS NOT NULL AS set FROM users WHERE id = $1`, [id]);
    expect(r.rows[0].set).toBe(true);
    expect((await pool.query(`SELECT count(*)::int AS n FROM sessions WHERE user_id = $1`, [id])).rows[0].n).toBe(0);
  });

  it('crée un administrateur et affiche le lien pour choisir son mot de passe', async () => {
    await run('user:create-admin', '--email', 'admin@ardha.fr', '--name', 'Admin');
    expect(output[0]).toMatch(/^Administrateur créé : admin@ardha\.fr \(/);
    expect(output[1]).toMatch(/Lien pour choisir le mot de passe, valable jusqu'au .*\nhttp:\/\/127\.0\.0\.1:14000\/reset-password#/);
  });

  it('liste, réinitialise, désactive et réactive', async () => {
    await run('user:list');
    await run('user:create-admin', '-e', 'admin@ardha.fr', '-n', 'Admin');
    await run('user:list');
    await run('user:reset-password', '--email', 'admin@ardha.fr');
    await run('user:deactivate', '--email', 'admin@ardha.fr');
    await run('user:list');
    await run('user:reactivate', '--email', 'admin@ardha.fr');
    expect(output[0]).toBe('Aucun compte.');
    expect(output[3]).toMatch(/^admin@ardha\.fr\tadmin\tmot de passe à choisir\tAdmin\tcréé le /);
    expect(output[4]).toMatch(/^Lien à transmettre, valable jusqu'au /);
    expect(output[5]).toBe('Compte désactivé ; 0 session(s) fermée(s).');
    expect(output[6]).toMatch(/\tdésactivé\t/);
    expect(output[7]).toBe('Compte réactivé.');
  });
});

describe('CLI de la carte et du parcellaire', () => {
  beforeAll(async () => {
    const ready = await pool.query(`SELECT 1 FROM source_states WHERE scope = '37023' AND status = 'ready'`);
    if (ready.rowCount === 0) await run('commune:load', '--inline', '37023');
  });

  it('commune:load --inline, commune:show, commune:list', async () => {
    output = [];
    await run('commune:load', '--inline', '37023');
    await run('commune:show', '37023');
    await run('commune:list');
    expect(output[0]).toBe('Beaumont-Village (37023) : 1145 parcelles, millésime 2026-09-01.');
    expect(output[1]).toMatch(/^Beaumont-Village \(37023\)\n {2}cadastre : prêt, millésime 2026-09-01, 1145 parcelles\n {2}chargé le : \d\d\/\d\d\/\d{4}/);
    expect(output[2]).toContain('37023\tprêt\t2026-09-01\t1145\tBeaumont-Village');
    await run('commune:load', '9404');
    expect(errors.join('\n')).toContain('Code commune invalide : 9404');
  });

  it('commune:load met en file (le worker chargera) ; --json', async () => {
    await pool.query(`DELETE FROM source_states WHERE scope = '94046'`);
    await run('commune:load', '--json', '94046');
    expect(JSON.parse(output[0]!)).toMatchObject({ code: '94046', cadastre: { status: 'queued' } });
    await run('commune:show', '99999');
    expect(output[1]).toContain('(nom inconnu) (99999)\n  cadastre : jamais demandé');
  });

  it('parcel:at, parcel:show, parcel:selection', async () => {
    await run('parcel:at', '1.2065', '47.1824');
    const id = /— (37023\w{9})/.exec(output[0]!)?.[1];
    expect(id).toBeDefined();
    expect(output[0]).toMatch(/contenance : .+\n {2}surface calculée : .+ m²|ha/);
    await run('parcel:show', id!, '37023000ZZ9999');
    expect(output[1]).toContain('37023000ZZ9999 : inconnue (commune chargée ?)');
    await run('parcel:at', '--json', '0', '0');
    expect(output[2]).toBe('null');
    await run('parcel:show', 'abc');
    await run('parcel:at', 'x', '1');
    expect(errors.join('\n')).toMatch(/Identifiant de parcelle invalide : abc[\s\S]*Longitude invalide : x/);
    await run('parcel:selection', id!, id!);
    expect(output[3]).toMatch(/ajoutée\n.*retirée\n\n0 parcelle\(s\), 0 morceau\(x\)/);
    process.exitCode = 0;
  });

  it('address:search et address:reverse en --inline (sans worker), et commune de référence', async () => {
    await run('address:search', '--inline', '9', 'rue', 'Pasteur', 'Maisons-Alfort');
    expect(output[0]).toMatch(/^9 Rue Pasteur 94700 Maisons-Alfort\t94046\t2\.4\d+,48\.8\d+\thousenumber/);
    await run('address:reverse', '--inline', '--json', '2.43', '48.8');
    expect(JSON.parse(output[1]!)).toMatchObject({ communeCode: '94046' });
  });
});
