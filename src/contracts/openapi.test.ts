import { describe, expect, it } from 'vitest';

import { documentOpenApi, routes } from './index.ts';

describe('documentOpenApi', () => {
  const doc = documentOpenApi(routes, '0.0.0');

  it('décrit chaque route, avec sa méthode et son code de succès', () => {
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/auth/password-reset',
      '/api/auth/signup',
      '/api/health',
    ]);
    const connexion = doc.paths['/api/auth/login']?.post as { responses: Record<string, unknown>; requestBody: unknown };
    expect(Object.keys(connexion.responses)).toEqual(['200', 'default']);
    expect(connexion.requestBody).toBeDefined();
  });

  it('marque les routes qui exigent une session', () => {
    expect((doc.paths['/api/auth/me']?.get as { security?: unknown }).security).toEqual([{ session: [] }]);
    expect((doc.paths['/api/auth/login']?.post as { security?: unknown }).security).toBeUndefined();
  });

  it('une route sans réponse n’a pas de contenu', () => {
    const deco = doc.paths['/api/auth/logout']?.post as { responses: Record<string, { content?: unknown }> };
    expect(deco.responses['204']?.content).toBeUndefined();
  });
});
