import { describe, expect, it } from 'vitest';

import { lireConfig } from './config.ts';

const minimum = { DATABASE_URL: 'postgres://x@h/b', REDIS_URL: 'redis://h', WEB_ORIGIN: 'http://w' };

describe('lireConfig', () => {
  it('applique les valeurs par défaut', () => {
    expect(lireConfig(minimum)).toMatchObject({ NODE_ENV: 'development', API_PORT: 13000, SESSION_COOKIE_NAME: 'ardha_session', production: false });
  });

  it('dit clairement ce qui manque', () => {
    expect(() => lireConfig({})).toThrow(/DATABASE_URL[\s\S]*pnpm demarrer/);
  });

  it('reconnaît la production', () => {
    expect(lireConfig({ ...minimum, NODE_ENV: 'production' }).production).toBe(true);
  });
});
