import { describe, expect, it } from 'vitest';

import { connexionRedis } from './worker.module.ts';

describe('connexionRedis', () => {
  it('lit hôte, port et base', () => {
    expect(connexionRedis('redis://127.0.0.1:16379/2')).toEqual({ host: '127.0.0.1', port: 16379, db: 2, maxRetriesPerRequest: null });
  });

  it('lit l’authentification et le TLS', () => {
    expect(connexionRedis('rediss://u:p%40ss@h')).toEqual({
      host: 'h', port: 6379, db: 0, username: 'u', password: 'p@ss', tls: {}, maxRetriesPerRequest: null,
    });
  });
});
