// Intégration de l'authentification (F-00) : l'API réelle, contre la base de test du worktree.
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POOL } from '../src/db/db.ts';
import { UsersService } from '../src/accounts/users.service.ts';
import { type TestApp, createTestApp } from './test-app.ts';

const PASSWORD = 'cheval pomme agrafe';
const DAY = 24 * 3600 * 1000;

let t: TestApp;
let pool: pg.Pool;
const http = () => request(t.app.getHttpServer());

beforeAll(async () => {
  t = await createTestApp();
  pool = t.app.get(POOL);
});
afterAll(() => t.close());
beforeEach(() => t.reset());

function cookieOf(response: request.Response): string {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  const c = raw?.find((l) => l.startsWith(`${t.config.SESSION_COOKIE_NAME}=`));
  if (!c) throw new Error('pas de cookie de session');
  return c;
}
const cookieValue = (c: string) => c.split(';')[0]!;

async function signup(email = 'alice@exemple.fr', ip = '10.0.0.1') {
  return http()
    .post('/api/auth/signup')
    .set('X-Forwarded-For', ip)
    .send({ email, name: 'Alice Martin', password: PASSWORD });
}

async function login(email: string, password: string, ip = '10.0.0.2') {
  return http().post('/api/auth/login').set('X-Forwarded-For', ip).send({ email, password });
}

async function auditLog(): Promise<{ action: string; details: Record<string, unknown> }[]> {
  const r = await pool.query('SELECT action, details FROM journal_audit ORDER BY cree_le, id');
  return r.rows;
}

describe('inscription', () => {
  it('crée le compte, ouvre une session par cookie httpOnly et rend l’utilisateur', async () => {
    const r = await signup(' Alice@Exemple.FR ');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ email: 'alice@exemple.fr', name: 'Alice Martin', role: 'utilisateur' });
    const cookie = cookieOf(r);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=2592000/); // 30 jours
    const me = await http().get('/api/auth/me').set('Cookie', cookieValue(cookie));
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('alice@exemple.fr');
  });

  it('ne garde du jeton de session que son empreinte, et hache le mot de passe en argon2id', async () => {
    const r = await signup();
    const token = cookieValue(cookieOf(r)).split('=')[1]!;
    const s = await pool.query('SELECT jeton_hash FROM session');
    expect(s.rows[0].jeton_hash).not.toBe(token);
    expect(s.rows[0].jeton_hash).toMatch(/^[0-9a-f]{64}$/);
    const u = await pool.query('SELECT mot_de_passe_hash FROM utilisateur');
    expect(u.rows[0].mot_de_passe_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('refuse une adresse déjà utilisée, quelle que soit la casse', async () => {
    await signup('alice@exemple.fr');
    const r = await signup('ALICE@exemple.fr');
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      message: 'Cette adresse e-mail est déjà utilisée.',
      fields: { email: 'Cette adresse e-mail est déjà utilisée.' },
    });
  });

  it('rend un message par champ quand le formulaire est invalide', async () => {
    const r = await http().post('/api/auth/signup').send({ email: 'alice', name: '', password: 'court' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      message: 'Certains champs sont à corriger.',
      fields: {
        email: 'Adresse e-mail invalide.',
        name: 'Le nom est obligatoire.',
        password: 'Le mot de passe doit faire au moins 12 caractères.',
      },
    });
  });
});

describe('connexion', () => {
  beforeEach(async () => {
    await signup();
  });

  it('ouvre une session avec le bon mot de passe', async () => {
    const r = await login('Alice@exemple.fr', PASSWORD);
    expect(r.status).toBe(200);
    expect(r.body.email).toBe('alice@exemple.fr');
    expect(cookieOf(r)).toBeTruthy();
  });

  it('même message pour un mauvais mot de passe et pour un compte inconnu', async () => {
    const wrong = await login('alice@exemple.fr', 'pas le bon mot de passe');
    const unknownUser = await login('bob@exemple.fr', PASSWORD);
    expect(wrong.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrong.body).toEqual({ message: 'Adresse e-mail ou mot de passe incorrect.' });
    expect(unknownUser.body).toEqual(wrong.body);
  });

  it('journalise les échecs sans jamais y écrire le mot de passe', async () => {
    await login('alice@exemple.fr', 'pas le bon mot de passe');
    const lines = await auditLog();
    expect(lines.map((l) => l.action)).toEqual(['user.signed-up', 'login.failed']);
    expect(JSON.stringify(lines)).not.toContain('pas le bon mot de passe');
    expect(lines[1]!.details).toEqual({ email: 'alice@exemple.fr' });
  });

  it('refuse un compte désactivé, et le dit une fois le mot de passe vérifié', async () => {
    await t.app.get(UsersService).deactivate('alice@exemple.fr');
    const r = await login('alice@exemple.fr', PASSWORD);
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Ce compte est désactivé. Contactez l’administrateur.');
    expect((await login('alice@exemple.fr', 'pas le bon mot de passe')).status).toBe(401);
  });
});

describe('session', () => {
  it('sans cookie, « qui suis-je » répond 401 avec un message en français', async () => {
    const r = await http().get('/api/auth/me');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ message: 'Vous devez vous connecter.' });
  });

  it('un cookie inventé ne mène à rien', async () => {
    const r = await http().get('/api/auth/me').set('Cookie', `${t.config.SESSION_COOKIE_NAME}=invente`);
    expect(r.status).toBe(401);
  });

  it('la déconnexion ferme la session et efface le cookie', async () => {
    const cookie = cookieValue(cookieOf(await signup()));
    const r = await http().post('/api/auth/logout').set('Cookie', cookie);
    expect(r.status).toBe(204);
    expect(cookieOf(r)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await pool.query('SELECT count(*)::int AS n FROM session')).rows[0].n).toBe(0);
  });

  it('la déconnexion sans session répond tout de même 204', async () => {
    expect((await http().post('/api/auth/logout')).status).toBe(204);
  });

  it('se prolonge à l’usage : 30 jours à partir de la dernière activité', async () => {
    const cookie = cookieValue(cookieOf(await signup()));
    t.clock.advance(20 * DAY);
    const r = await http().get('/api/auth/me').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(cookieOf(r)).toMatch(/Max-Age=2592000/);
    t.clock.advance(20 * DAY); // 40 jours après la connexion, 20 après la dernière activité
    expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
  });

  it('expire après 30 jours sans usage', async () => {
    const cookie = cookieValue(cookieOf(await signup()));
    t.clock.advance(30 * DAY + 1000);
    expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await pool.query('SELECT count(*)::int AS n FROM session')).rows[0].n).toBe(0);
  });

  it('expire 90 jours après la connexion, même utilisée tous les jours', async () => {
    const cookie = cookieValue(cookieOf(await signup()));
    for (const _ of [29, 58, 87]) {
      t.clock.advance(29 * DAY);
      expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    }
    t.clock.advance(4 * DAY); // 91 jours
    expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('se ferme quand le compte est désactivé', async () => {
    const cookie = cookieValue(cookieOf(await signup()));
    await t.app.get(UsersService).deactivate('alice@exemple.fr');
    expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('limitation des tentatives (Q7)', () => {
  it('bloque une adresse e-mail après 5 tentatives, même depuis des IP différentes', async () => {
    await signup();
    for (let i = 0; i < 5; i++) {
      expect((await login('alice@exemple.fr', 'mauvais mot de passe', `10.1.0.${i}`)).status).toBe(401);
    }
    const r = await login('alice@exemple.fr', PASSWORD, '10.1.0.99');
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ message: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  });

  it('bloque une IP après 5 tentatives, même sur des adresses différentes', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login(`inconnu${i}@exemple.fr`, 'x', '10.2.0.1')).status).toBe(401);
    }
    expect((await login('autre@exemple.fr', 'x', '10.2.0.1')).status).toBe(429);
    expect((await login('autre@exemple.fr', 'x', '10.2.0.2')).status).toBe(401);
  });

  it('ne limite pas « qui suis-je »', async () => {
    const cookie = cookieValue(cookieOf(await signup()));
    for (let i = 0; i < 8; i++) expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
  });
});

describe('réinitialisation par lien (Q9)', () => {
  async function link(email = 'alice@exemple.fr'): Promise<string> {
    const { url } = await t.app.get(UsersService).createResetLink(email);
    return decodeURIComponent(new URL(url).hash.slice(1));
  }
  const resetPassword = (token: string, password: string) =>
    http().post('/api/auth/password-reset').set('X-Forwarded-For', '10.3.0.1').send({ token, password });

  it('change le mot de passe, ferme toutes les sessions, et ne sert qu’une fois', async () => {
    const cookie = cookieValue(cookieOf(await signup()));
    const token = await link();
    expect((await resetPassword(token, 'nouveau mot de passe solide')).status).toBe(204);
    expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await login('alice@exemple.fr', 'nouveau mot de passe solide')).status).toBe(200);
    expect((await login('alice@exemple.fr', PASSWORD, '10.3.0.9')).status).toBe(401);
    const again = await resetPassword(token, 'encore un autre mot de passe');
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Ce lien n’est plus valable. Demandez-en un nouveau à l’administrateur.');
  });

  it('un mot de passe refusé ne consomme pas le lien', async () => {
    await signup();
    const token = await link();
    const r = await resetPassword(token, 'alice@exemple.fr');
    expect(r.status).toBe(400);
    expect(r.body.fields).toEqual({ password: 'Le mot de passe ne doit pas être votre adresse e-mail.' });
    expect((await resetPassword(token, 'nouveau mot de passe solide')).status).toBe(204);
  });

  it('expire au bout de 24 heures', async () => {
    await signup();
    const token = await link();
    t.clock.advance(DAY);
    expect((await resetPassword(token, 'nouveau mot de passe solide')).status).toBe(400);
  });

  it('un nouveau lien annule le précédent', async () => {
    await signup();
    const older = await link();
    const newer = await link();
    expect((await resetPassword(older, 'nouveau mot de passe solide')).status).toBe(400);
    expect((await resetPassword(newer, 'nouveau mot de passe solide')).status).toBe(204);
  });

  it('un jeton inventé est refusé', async () => {
    expect((await resetPassword('invente', 'nouveau mot de passe solide')).status).toBe(400);
  });
});

describe('protection contre les requêtes intersites', () => {
  it('refuse une origine étrangère', async () => {
    const r = await http().post('/api/auth/login').set('Origin', 'https://malveillant.example').send({ email: 'a@b.fr', password: 'x' });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ message: 'Accès refusé.' });
  });

  it('refuse une requête intersite signalée par le navigateur', async () => {
    const r = await http().post('/api/auth/logout').set('Sec-Fetch-Site', 'cross-site');
    expect(r.status).toBe(403);
  });

  it('accepte l’origine du front', async () => {
    const r = await http().post('/api/auth/login').set('Origin', 'http://127.0.0.1:14000').send({ email: 'a@b.fr', password: 'x' });
    expect(r.status).toBe(401);
  });

  it('refuse un corps qui n’est pas du JSON (formulaire intersite)', async () => {
    const r = await http().post('/api/auth/login').set('Content-Type', 'text/plain').send('email=a@b.fr');
    expect(r.status).toBe(415);
    expect(r.body).toEqual({ message: 'Format de requête non pris en charge.' });
  });
});

describe('système', () => {
  it('santé : base et Redis joignables', async () => {
    const r = await http().get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('sert le document OpenAPI dérivé du contrat', async () => {
    const r = await http().get('/api/openapi.json');
    expect(r.status).toBe(200);
    expect(r.body.openapi).toBe('3.1.0');
    expect(Object.keys(r.body.paths)).toContain('/api/auth/login');
  });

  it('une route inconnue répond 404 en français', async () => {
    const r = await http().get('/api/nulle-part');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ message: 'Ressource introuvable.' });
  });
});
