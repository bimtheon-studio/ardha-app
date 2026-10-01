// Contrat de déploiement sur once (lot LD, D-13) : front servi par l'API à la même
// origine, cookie selon le TLS, clés Redis sous le préfixe de l'environnement.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REDIS } from '../src/shared/redis.ts';
import { signedIn } from './session.ts';
import { type TestApp, createTestApp } from './test-app.ts';

const INDEX = '<!doctype html><title>Ardha</title><div id="root"></div>';

let front: string;
let t: TestApp;
const http = () => request(t.app.getHttpServer());

beforeAll(async () => {
  front = mkdtempSync(path.join(tmpdir(), 'ardha-front-'));
  mkdirSync(path.join(front, 'assets'));
  writeFileSync(path.join(front, 'index.html'), INDEX);
  writeFileSync(path.join(front, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(path.join(front, 'favicon.svg'), '<svg/>');
  t = await createTestApp({ config: { FRONTEND_DIR: front, REDIS_PREFIX: `ardha-test-${process.pid}` } });
});
afterAll(async () => {
  await t.close();
  rmSync(front, { recursive: true, force: true });
});

describe('front servi par l’API', () => {
  it('sert index.html à la racine, sans cache', async () => {
    const r = await http().get('/');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/html/);
    expect(r.headers['cache-control']).toBe('no-cache');
    expect(r.text).toBe(INDEX);
  });

  it('renvoie index.html pour une route du front (repli SPA)', async () => {
    for (const url of ['/map', '/reset-password', '/map?parcels=94046000AB0001']) {
      const r = await http().get(url).set('Accept', 'text/html');
      expect(r.status, url).toBe(200);
      expect(r.text, url).toBe(INDEX);
      expect(r.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('sert les fichiers construits, ceux de /assets en cache immuable', async () => {
    const asset = await http().get('/assets/index-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const icon = await http().get('/favicon.svg');
    expect(icon.status).toBe(200);
    expect(icon.headers['cache-control']).toBe('no-cache');
  });

  it('un fichier absent de /assets répond 404 (pas index.html, que le navigateur prendrait pour du JS)', async () => {
    const r = await http().get('/assets/disparu-000.js');
    expect(r.status).toBe(404);
  });

  it('ne masque pas l’API : une route /api inconnue reste un 404 JSON', async () => {
    const r = await http().get('/api/nulle-part').set('Accept', 'text/html');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ message: 'Ressource introuvable.' });
  });

  it('un POST hors /api n’est pas servi par le front', async () => {
    const r = await http().post('/map').send({});
    expect(r.status).toBe(404);
  });
});

describe('cookie et TLS', () => {
  async function cookieFlags(config: NodeJS.ProcessEnv): Promise<string> {
    const app = await createTestApp({ config });
    try {
      const r = await request(app.app.getHttpServer())
        .post('/api/auth/signup')
        .set('X-Forwarded-For', '10.9.0.1')
        .send({ email: `tls${Math.random().toString(36).slice(2, 8)}@exemple.fr`, name: 'TLS', password: 'cheval pomme agrafe' });
      const raw = r.headers['set-cookie'] as unknown as string[];
      return raw.find((l) => l.startsWith(`${app.config.SESSION_COOKIE_NAME}=`))!;
    } finally {
      await app.reset();
      await app.close();
    }
  }

  it('en production : cookie Secure ; derrière once sans TLS (DISABLE_SSL) : sans Secure', async () => {
    expect(await cookieFlags({ NODE_ENV: 'production' })).toMatch(/; Secure/);
    expect(await cookieFlags({ NODE_ENV: 'production', DISABLE_SSL: 'true' })).not.toMatch(/; Secure/);
  });
});

describe('préfixe Redis de l’environnement', () => {
  it('les compteurs du limiteur vivent sous REDIS_PREFIX', async () => {
    await signedIn(t);
    await http().post('/api/auth/login').set('X-Forwarded-For', '10.9.9.9').send({ email: 'x@exemple.fr', password: 'faux' });
    const redis = t.app.get<Redis>(REDIS);
    const keys = await redis.keys(`ardha-test-${process.pid}:${t.config.SESSION_COOKIE_NAME}:rate-limit:*`);
    expect(keys.length).toBeGreaterThan(0);
    await t.reset();
  });
});
