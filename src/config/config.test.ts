import { describe, expect, it } from 'vitest';

import { readConfig } from './config.ts';

const minimum = { DATABASE_URL: 'postgres://x@h/b', REDIS_URL: 'redis://h', WEB_ORIGIN: 'http://w' };

describe('lireConfig', () => {
  it('applique les valeurs par défaut', () => {
    expect(readConfig(minimum)).toMatchObject({ NODE_ENV: 'development', API_PORT: 13000, SESSION_COOKIE_NAME: 'ardha_session', production: false });
  });

  it('dit clairement ce qui manque', () => {
    expect(() => readConfig({})).toThrow(/DATABASE_URL[\s\S]*pnpm start/);
  });

  it('reconnaît la production', () => {
    expect(readConfig({ ...minimum, NODE_ENV: 'production' }).production).toBe(true);
  });

  it('cookies Secure en production, sauf DISABLE_SSL (once sans TLS)', () => {
    expect(readConfig(minimum).secureCookies).toBe(false);
    expect(readConfig({ ...minimum, NODE_ENV: 'production' }).secureCookies).toBe(true);
    expect(readConfig({ ...minimum, NODE_ENV: 'production', DISABLE_SSL: 'true' }).secureCookies).toBe(false);
    expect(readConfig({ ...minimum, NODE_ENV: 'production', DISABLE_SSL: 'false' }).secureCookies).toBe(true);
  });
});

describe('contrat once', () => {
  const { WEB_ORIGIN: _, ...withoutOrigin } = minimum;

  it('prend BASE_URL (injectée par once) comme origine du front', () => {
    expect(readConfig({ ...withoutOrigin, BASE_URL: 'https://ardha.once.florent.cc' }).WEB_ORIGIN).toBe('https://ardha.once.florent.cc');
  });

  it('WEB_ORIGIN explicite garde la main sur BASE_URL', () => {
    expect(readConfig({ ...minimum, BASE_URL: 'https://autre' }).WEB_ORIGIN).toBe('http://w');
  });
});

describe('préfixe Redis', () => {
  it('par défaut « ardha », files sous « ardha:bull »', () => {
    expect(readConfig(minimum)).toMatchObject({ REDIS_PREFIX: 'ardha', QUEUE_PREFIX: 'ardha:bull' });
  });

  it('un environnement a le sien, et ses files le suivent', () => {
    expect(readConfig({ ...minimum, REDIS_PREFIX: 'ardha-pr-12' })).toMatchObject({ REDIS_PREFIX: 'ardha-pr-12', QUEUE_PREFIX: 'ardha-pr-12:bull' });
  });

  it('QUEUE_PREFIX explicite (tests) garde la main', () => {
    expect(readConfig({ ...minimum, REDIS_PREFIX: 'ardha-pr-12', QUEUE_PREFIX: 'test:1' }).QUEUE_PREFIX).toBe('test:1');
  });
});
