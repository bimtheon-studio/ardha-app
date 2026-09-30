// Les commandes de la CLI, de bout en bout sur la base de test.
import { CommandTestFactory } from 'nest-commander-testing';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CliModule } from '../src/cli/cli.module.ts';
import { testConfig } from './env.ts';

const config = testConfig();
let pool: pg.Pool;
let output: string[];

beforeAll(() => {
  pool = new pg.Pool({ connectionString: config.DATABASE_URL });
});
afterAll(() => pool.end());
beforeEach(async () => {
  await pool.query('TRUNCATE users, sessions, password_resets, audit_logs CASCADE');
  output = [];
  vi.spyOn(console, 'log').mockImplementation((...m: unknown[]) => void output.push(m.join(' ')));
});
afterEach(() => vi.restoreAllMocks());

/** Comme en production, chaque commande a sa propre application, fermée à la fin de la commande. */
async function run(...args: string[]): Promise<void> {
  const cli = await CommandTestFactory.createTestingCommand({ imports: [CliModule.forConfig(config)] }).compile();
  await CommandTestFactory.run(cli, args);
}

describe('CLI', () => {
  it('migrate est idempotent, seed ne fait rien en L0', async () => {
    await run('migrate');
    await run('seed');
    expect(output).toEqual(['Migrations à jour.', 'Seed : rien à semer en L0.']);
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
