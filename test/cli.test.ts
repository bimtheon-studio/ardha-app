// Les commandes de la CLI, de bout en bout sur la base de test.
import { CommandTestFactory } from 'nest-commander-testing';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CliModule } from '../src/cli/cli.module.ts';
import { configDeTest } from './env.ts';

const config = configDeTest();
let pool: pg.Pool;
let sortie: string[];

beforeAll(() => {
  pool = new pg.Pool({ connectionString: config.DATABASE_URL });
});
afterAll(() => pool.end());
beforeEach(async () => {
  await pool.query('TRUNCATE utilisateur, session, reinitialisation_mot_de_passe, journal_audit CASCADE');
  sortie = [];
  vi.spyOn(console, 'log').mockImplementation((...m: unknown[]) => void sortie.push(m.join(' ')));
});
afterEach(() => vi.restoreAllMocks());

/** Comme en production, chaque commande a sa propre application, fermée à la fin de la commande. */
async function lancer(...args: string[]): Promise<void> {
  const cli = await CommandTestFactory.createTestingCommand({ imports: [CliModule.pour(config)] }).compile();
  await CommandTestFactory.run(cli, args);
}

describe('CLI', () => {
  it('migrate est idempotent, seed ne fait rien en L0', async () => {
    await lancer('migrate');
    await lancer('seed');
    expect(sortie).toEqual(['Migrations à jour.', 'Seed : rien à semer en L0.']);
  });

  it('crée un administrateur et affiche le lien pour choisir son mot de passe', async () => {
    await lancer('user:create-admin', '--email', 'admin@ardha.fr', '--name', 'Admin');
    expect(sortie[0]).toMatch(/^Administrateur créé : admin@ardha\.fr \(/);
    expect(sortie[1]).toMatch(/Lien pour choisir le mot de passe, valable jusqu'au .*\nhttp:\/\/127\.0\.0\.1:14000\/reset-password#/);
  });

  it('liste, réinitialise, désactive et réactive', async () => {
    await lancer('user:list');
    await lancer('user:create-admin', '-e', 'admin@ardha.fr', '-n', 'Admin');
    await lancer('user:list');
    await lancer('user:reset-password', '--email', 'admin@ardha.fr');
    await lancer('user:deactivate', '--email', 'admin@ardha.fr');
    await lancer('user:list');
    await lancer('user:reactivate', '--email', 'admin@ardha.fr');
    expect(sortie[0]).toBe('Aucun compte.');
    expect(sortie[3]).toMatch(/^admin@ardha\.fr\tadmin\tmot de passe à choisir\tAdmin\tcréé le /);
    expect(sortie[4]).toMatch(/^Lien à transmettre, valable jusqu'au /);
    expect(sortie[5]).toBe('Compte désactivé ; 0 session(s) fermée(s).');
    expect(sortie[6]).toMatch(/\tdésactivé\t/);
    expect(sortie[7]).toBe('Compte réactivé.');
  });
});
