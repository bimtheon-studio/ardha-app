import { describe, expect, it } from 'vitest';

import { documentOpenApi, routes } from './index.ts';

describe('documentOpenApi', () => {
  const doc = documentOpenApi(routes, '0.0.0');

  it('décrit chaque route, avec sa méthode et son code de succès', () => {
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/api/addresses/reverse',
      '/api/addresses/search',
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/auth/password-reset',
      '/api/auth/signup',
      '/api/communes/locate',
      '/api/communes/{code}',
      '/api/communes/{code}/cadastre',
      '/api/map/layers',
      '/api/parcels',
      '/api/parcels/elevation',
      '/api/studies',
      '/api/studies/{id}',
      '/api/studies/{id}/duplicate',
      '/api/studies/{id}/parcels/{parcelId}',
      '/api/studies/{id}/restore',
      '/api/studies/{id}/risks',
      '/api/studies/{id}/thumbnail',
      '/up',
    ]);
    const login = doc.paths['/api/auth/login']?.post as { responses: Record<string, unknown>; requestBody: unknown };
    expect(Object.keys(login.responses)).toEqual(['200', 'default']);
    expect(login.requestBody).toBeDefined();
  });

  it('marque les routes qui exigent une session', () => {
    expect((doc.paths['/api/auth/me']?.get as { security?: unknown }).security).toEqual([{ session: [] }]);
    expect((doc.paths['/api/auth/login']?.post as { security?: unknown }).security).toBeUndefined();
  });

  it('une route sans réponse n’a pas de contenu', () => {
    const logoutOp = doc.paths['/api/auth/logout']?.post as { responses: Record<string, { content?: unknown }> };
    expect(logoutOp.responses['204']?.content).toBeUndefined();
  });

  it('une réponse qui n’est pas du JSON annonce son type de média', () => {
    const thumbnail = doc.paths['/api/studies/{id}/thumbnail']?.get as { responses: Record<string, { content?: unknown }> };
    expect(thumbnail.responses['200']?.content).toEqual({ 'image/png': { schema: { type: 'string', format: 'binary' } } });
  });
});

describe('paramètres', () => {
  const doc = documentOpenApi(routes, '0.0.0');
  type Op = { parameters?: { name: string; in: string; required: boolean; schema: unknown }[] };

  it('décrit les paramètres de chemin (obligatoires) et de requête (obligatoires ou non)', () => {
    const commune = doc.paths['/api/communes/{code}']?.get as Op;
    expect(commune.parameters).toEqual([{ name: 'code', in: 'path', required: true, schema: expect.objectContaining({ type: 'string' }) }]);
    const search = doc.paths['/api/addresses/search']?.get as Op;
    expect(search.parameters?.map((p) => [p.name, p.in, p.required])).toEqual([
      ['q', 'query', true],
      ['limit', 'query', false],
    ]);
    expect((doc.paths['/api/map/layers']?.get as Op).parameters).toBeUndefined();
  });
});
