// Intégration de l'administration des comptes (CLI) et de la purge du worker.
import { Test } from '@nestjs/testing';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthService } from '../src/accounts/auth.service.ts';
import { DbModule } from '../src/db/db.module.ts';
import { POOL } from '../src/db/db.ts';
import { DomainError } from '../src/shared/errors.ts';
import { Clock } from '../src/shared/clock.ts';
import { AccountsModule } from '../src/accounts/accounts.module.ts';
import { ConfigModule } from '../src/config/config.module.ts';
import { UsersService } from '../src/accounts/users.service.ts';
import { StudiesService } from '../src/studies/studies.service.ts';
import { MaintenanceProcessor, PURGE_JOB, Reconciliation } from '../src/worker/maintenance.ts';
import { TestClock } from './test-app.ts';
import { testConfig } from './env.ts';

const DAY = 24 * 3600 * 1000;
const ctx = { ip: '10.9.0.1', userAgent: 'vitest' };

let module: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
let clock: TestClock;
let pool: pg.Pool;
let service: UsersService;
let auth: AuthService;

beforeAll(async () => {
  clock = new TestClock();
  module = await Test.createTestingModule({
    imports: [ConfigModule.forConfig(testConfig()), DbModule, AccountsModule],
    providers: [
      MaintenanceProcessor,
      { provide: Reconciliation, useValue: { run: async () => ({ communes: [], studies: [] }) } },
      { provide: StudiesService, useValue: { purge: async () => [] } },
    ],
  })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  await module.init();
  pool = module.get(POOL);
  service = module.get(UsersService);
  auth = module.get(AuthService);
});
afterAll(() => module.close());
beforeEach(async () => {
  await pool.query('TRUNCATE users, sessions, password_resets, audit_logs CASCADE');
});

describe('user:create-admin', () => {
  it('sans mot de passe : compte admin sans hash, et lien pour le choisir', async () => {
    const { user, link } = await service.createAdmin({ email: ' Admin@Ardha.fr ', name: 'Admin' });
    expect(user).toMatchObject({ email: 'admin@ardha.fr', role: 'admin', passwordHash: null });
    expect(link?.url).toMatch(/^http:\/\/127\.0\.0\.1:14000\/reset-password#[A-Za-z0-9_-]{43}$/);
    const token = decodeURIComponent(new URL(link!.url).hash.slice(1));
    await auth.resetPassword({ token, password: 'mot de passe admin solide' }, ctx);
    const opened = await auth.login({ email: 'admin@ardha.fr', password: 'mot de passe admin solide' }, ctx);
    expect(opened.user.role).toBe('admin');
  });

  it('avec mot de passe : se connecte aussitôt, pas de lien', async () => {
    const r = await service.createAdmin({ email: 'a@ardha.fr', name: 'A', password: 'mot de passe admin solide' });
    expect(r.link).toBeUndefined();
    await expect(auth.login({ email: 'a@ardha.fr', password: 'mot de passe admin solide' }, ctx)).resolves.toBeTruthy();
  });

  it('applique la politique de mot de passe', async () => {
    await expect(service.createAdmin({ email: 'a@ardha.fr', name: 'A', password: 'court' })).rejects.toThrow(
      'Le mot de passe doit faire au moins 12 caractères.',
    );
  });

  it('refuse une adresse déjà prise', async () => {
    await service.createAdmin({ email: 'a@ardha.fr', name: 'A' });
    await expect(service.createAdmin({ email: 'A@ardha.fr', name: 'A' })).rejects.toBeInstanceOf(DomainError);
  });

  it('un compte sans mot de passe ne s’ouvre avec aucun mot de passe', async () => {
    await service.createAdmin({ email: 'a@ardha.fr', name: 'A' });
    await expect(auth.login({ email: 'a@ardha.fr', password: '' }, ctx)).rejects.toMatchObject({ code: 'invalid-credentials' });
  });
});

describe('désactivation (Q5)', () => {
  it('désactive, ferme les sessions, puis réactive', async () => {
    await auth.signup({ email: 'bob@exemple.fr', name: 'Bob', password: 'cheval pomme agrafe' }, ctx);
    await auth.login({ email: 'bob@exemple.fr', password: 'cheval pomme agrafe' }, ctx);
    expect(await service.deactivate('bob@exemple.fr')).toBe(2);
    await expect(auth.login({ email: 'bob@exemple.fr', password: 'cheval pomme agrafe' }, ctx)).rejects.toMatchObject({
      code: 'account-deactivated',
    });
    await service.reactivate('bob@exemple.fr');
    await expect(auth.login({ email: 'bob@exemple.fr', password: 'cheval pomme agrafe' }, ctx)).resolves.toBeTruthy();
    const actions = (await pool.query('SELECT action, origin FROM audit_logs ORDER BY created_at, id')).rows;
    expect(actions).toContainEqual({ action: 'user.deactivated', origin: 'cli' });
    expect(actions).toContainEqual({ action: 'user.reactivated', origin: 'cli' });
  });

  it('un compte inconnu est signalé', async () => {
    await expect(service.deactivate('personne@exemple.fr')).rejects.toMatchObject({ code: 'unknown-user' });
    await expect(service.createResetLink('personne@exemple.fr')).rejects.toMatchObject({ code: 'unknown-user' });
  });

  it('liste les comptes', async () => {
    await service.createAdmin({ email: 'a@ardha.fr', name: 'A' });
    await auth.signup({ email: 'b@exemple.fr', name: 'B', password: 'cheval pomme agrafe' }, ctx);
    expect((await service.list()).map((u) => u.email)).toEqual(['a@ardha.fr', 'b@exemple.fr']);
  });
});

describe('purge du worker', () => {
  it('supprime les sessions expirées et les liens périmés ou utilisés, garde le reste', async () => {
    await auth.signup({ email: 'c@exemple.fr', name: 'C', password: 'cheval pomme agrafe' }, ctx);
    await service.createResetLink('c@exemple.fr');
    clock.advance(31 * DAY);
    await auth.login({ email: 'c@exemple.fr', password: 'cheval pomme agrafe' }, ctx);
    const result = await module.get(MaintenanceProcessor).process({ name: PURGE_JOB } as never);
    expect(result).toEqual({ sessions: 1, links: 1, studies: 0 });
    expect((await pool.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n).toBe(1);
  });

  it('refuse une tâche inconnue', async () => {
    await expect(module.get(MaintenanceProcessor).process({ name: 'autre' } as never)).rejects.toThrow('Tâche inconnue');
  });
});
