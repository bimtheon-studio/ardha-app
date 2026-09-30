import { authRoutes } from '@contracts';
import { describe, expect, it, vi } from 'vitest';

import { alice, fakeApi } from '@/test/helpers';

import { callApi, CallError } from './client';

describe('appeler', () => {
  it('envoie le corps en JSON et valide la réponse', async () => {
    const calls = fakeApi({ 'POST /api/auth/login': { status: 200, body: alice } });
    await expect(callApi(authRoutes.login, { body: { email: 'a@b.fr', password: 'x' } })).resolves.toEqual(alice);
    expect(calls).toEqual([{ key: 'POST /api/auth/login', body: { email: 'a@b.fr', password: 'x' } }]);
  });

  it('rend undefined pour une réponse sans contenu', async () => {
    fakeApi({ 'POST /api/auth/logout': { status: 204 } });
    await expect(callApi(authRoutes.logout)).resolves.toBeUndefined();
  });

  it('traduit une erreur de l’API, avec ses champs', async () => {
    fakeApi({ 'POST /api/auth/signup': { status: 409, body: { message: 'Déjà utilisée.', fields: { email: 'Déjà utilisée.' } } } });
    const e = await callApi(authRoutes.signup, { body: { email: 'a@b.fr', name: 'A', password: 'x' } }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(CallError);
    expect(e).toMatchObject({ status: 409, message: 'Déjà utilisée.', fields: { email: 'Déjà utilisée.' } });
  });

  it('a un message pour une erreur illisible et pour un serveur injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })));
    await expect(callApi(authRoutes.me)).rejects.toMatchObject({ status: 502, message: 'La requête a échoué. Réessayez dans un instant.' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('réseau'))));
    await expect(callApi(authRoutes.me)).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/ne répond pas/) });
  });

  it('refuse une réponse qui ne respecte pas le contrat', async () => {
    fakeApi({ 'GET /api/auth/me': { status: 200, body: { id: 'pas-un-uuid' } } });
    await expect(callApi(authRoutes.me)).rejects.toThrow();
  });
});
