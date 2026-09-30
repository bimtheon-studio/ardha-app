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
});
