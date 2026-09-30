// Intégration de l'administration des comptes (CLI) et de la purge du worker.
import { Test } from '@nestjs/testing';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthService } from '../src/accounts/auth.service.ts';
import { BaseModule } from '../src/db/db.module.ts';
import { POOL } from '../src/db/db.ts';
import { ErreurMetier } from '../src/shared/errors.ts';
import { Horloge } from '../src/shared/clock.ts';
import { ComptesModule } from '../src/accounts/accounts.module.ts';
import { ConfigModule } from '../src/config/config.module.ts';
import { UtilisateursService } from '../src/accounts/users.service.ts';
import { MaintenanceProcessor, TACHE_PURGE } from '../src/worker/maintenance.ts';
import { HorlogeDeTest } from './test-app.ts';
import { configDeTest } from './env.ts';

const JOUR = 24 * 3600 * 1000;
const ctx = { ip: '10.9.0.1', agentUtilisateur: 'vitest' };

let module: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
let horloge: HorlogeDeTest;
let pool: pg.Pool;
let service: UtilisateursService;
let auth: AuthService;

beforeAll(async () => {
  horloge = new HorlogeDeTest();
  module = await Test.createTestingModule({
    imports: [ConfigModule.pour(configDeTest()), BaseModule, ComptesModule],
    providers: [MaintenanceProcessor],
  })
    .overrideProvider(Horloge)
    .useValue(horloge)
    .compile();
  await module.init();
  pool = module.get(POOL);
  service = module.get(UtilisateursService);
  auth = module.get(AuthService);
});
afterAll(() => module.close());
beforeEach(async () => {
  await pool.query('TRUNCATE utilisateur, session, reinitialisation_mot_de_passe, journal_audit CASCADE');
});

describe('user:create-admin', () => {
  it('sans mot de passe : compte admin sans hash, et lien pour le choisir', async () => {
    const { utilisateur, lien } = await service.creerAdmin({ email: ' Admin@Ardha.fr ', nom: 'Admin' });
    expect(utilisateur).toMatchObject({ email: 'admin@ardha.fr', role: 'admin', motDePasseHash: null });
    expect(lien?.url).toMatch(/^http:\/\/127\.0\.0\.1:14000\/reset-password#[A-Za-z0-9_-]{43}$/);
    const jeton = decodeURIComponent(new URL(lien!.url).hash.slice(1));
    await auth.reinitialiser({ jeton, motDePasse: 'mot de passe admin solide' }, ctx);
    const ouverte = await auth.connecter({ email: 'admin@ardha.fr', motDePasse: 'mot de passe admin solide' }, ctx);
    expect(ouverte.utilisateur.role).toBe('admin');
  });

  it('avec mot de passe : se connecte aussitôt, pas de lien', async () => {
    const r = await service.creerAdmin({ email: 'a@ardha.fr', nom: 'A', motDePasse: 'mot de passe admin solide' });
    expect(r.lien).toBeUndefined();
    await expect(auth.connecter({ email: 'a@ardha.fr', motDePasse: 'mot de passe admin solide' }, ctx)).resolves.toBeTruthy();
  });

  it('applique la politique de mot de passe', async () => {
    await expect(service.creerAdmin({ email: 'a@ardha.fr', nom: 'A', motDePasse: 'court' })).rejects.toThrow(
      'Le mot de passe doit faire au moins 12 caractères.',
    );
  });

  it('refuse une adresse déjà prise', async () => {
    await service.creerAdmin({ email: 'a@ardha.fr', nom: 'A' });
    await expect(service.creerAdmin({ email: 'A@ardha.fr', nom: 'A' })).rejects.toBeInstanceOf(ErreurMetier);
  });

  it('un compte sans mot de passe ne s’ouvre avec aucun mot de passe', async () => {
    await service.creerAdmin({ email: 'a@ardha.fr', nom: 'A' });
    await expect(auth.connecter({ email: 'a@ardha.fr', motDePasse: '' }, ctx)).rejects.toMatchObject({ code: 'identifiants-invalides' });
  });
});

describe('désactivation (Q5)', () => {
  it('désactive, ferme les sessions, puis réactive', async () => {
    await auth.inscrire({ email: 'bob@exemple.fr', nom: 'Bob', motDePasse: 'cheval pomme agrafe' }, ctx);
    await auth.connecter({ email: 'bob@exemple.fr', motDePasse: 'cheval pomme agrafe' }, ctx);
    expect(await service.desactiver('bob@exemple.fr')).toBe(2);
    await expect(auth.connecter({ email: 'bob@exemple.fr', motDePasse: 'cheval pomme agrafe' }, ctx)).rejects.toMatchObject({
      code: 'compte-desactive',
    });
    await service.reactiver('bob@exemple.fr');
    await expect(auth.connecter({ email: 'bob@exemple.fr', motDePasse: 'cheval pomme agrafe' }, ctx)).resolves.toBeTruthy();
    const actions = (await pool.query('SELECT action, origine FROM journal_audit ORDER BY cree_le, id')).rows;
    expect(actions).toContainEqual({ action: 'utilisateur.desactive', origine: 'cli' });
    expect(actions).toContainEqual({ action: 'utilisateur.reactive', origine: 'cli' });
  });

  it('un compte inconnu est signalé', async () => {
    await expect(service.desactiver('personne@exemple.fr')).rejects.toMatchObject({ code: 'utilisateur-inconnu' });
    await expect(service.creerLienReinitialisation('personne@exemple.fr')).rejects.toMatchObject({ code: 'utilisateur-inconnu' });
  });

  it('liste les comptes', async () => {
    await service.creerAdmin({ email: 'a@ardha.fr', nom: 'A' });
    await auth.inscrire({ email: 'b@exemple.fr', nom: 'B', motDePasse: 'cheval pomme agrafe' }, ctx);
    expect((await service.lister()).map((u) => u.email)).toEqual(['a@ardha.fr', 'b@exemple.fr']);
  });
});

describe('purge du worker', () => {
  it('supprime les sessions expirées et les liens périmés ou utilisés, garde le reste', async () => {
    await auth.inscrire({ email: 'c@exemple.fr', nom: 'C', motDePasse: 'cheval pomme agrafe' }, ctx);
    await service.creerLienReinitialisation('c@exemple.fr');
    horloge.avancer(31 * JOUR);
    await auth.connecter({ email: 'c@exemple.fr', motDePasse: 'cheval pomme agrafe' }, ctx);
    const bilan = await module.get(MaintenanceProcessor).process({ name: TACHE_PURGE } as never);
    expect(bilan).toEqual({ sessions: 1, liens: 1 });
    expect((await pool.query('SELECT count(*)::int AS n FROM session')).rows[0].n).toBe(1);
  });

  it('refuse une tâche inconnue', async () => {
    await expect(module.get(MaintenanceProcessor).process({ name: 'autre' } as never)).rejects.toThrow('Tâche inconnue');
  });
});
