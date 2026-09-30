import { routesAuth } from '@contrats';
import { describe, expect, it, vi } from 'vitest';

import { alice, fausseApi } from '@/test/outils';

import { appeler, ErreurAppel } from './client';

describe('appeler', () => {
  it('envoie le corps en JSON et valide la réponse', async () => {
    const appels = fausseApi({ 'POST /api/auth/connexion': { statut: 200, corps: alice } });
    await expect(appeler(routesAuth.connexion, { email: 'a@b.fr', motDePasse: 'x' })).resolves.toEqual(alice);
    expect(appels).toEqual([{ cle: 'POST /api/auth/connexion', corps: { email: 'a@b.fr', motDePasse: 'x' } }]);
  });

  it('rend undefined pour une réponse sans contenu', async () => {
    fausseApi({ 'POST /api/auth/deconnexion': { statut: 204 } });
    await expect(appeler(routesAuth.deconnexion)).resolves.toBeUndefined();
  });

  it('traduit une erreur de l’API, avec ses champs', async () => {
    fausseApi({ 'POST /api/auth/inscription': { statut: 409, corps: { message: 'Déjà utilisée.', champs: { email: 'Déjà utilisée.' } } } });
    const e = await appeler(routesAuth.inscription, { email: 'a@b.fr', nom: 'A', motDePasse: 'x' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurAppel);
    expect(e).toMatchObject({ statut: 409, message: 'Déjà utilisée.', champs: { email: 'Déjà utilisée.' } });
  });

  it('a un message pour une erreur illisible et pour un serveur injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })));
    await expect(appeler(routesAuth.moi)).rejects.toMatchObject({ statut: 502, message: 'La requête a échoué. Réessayez dans un instant.' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('réseau'))));
    await expect(appeler(routesAuth.moi)).rejects.toMatchObject({ statut: 0, message: expect.stringMatching(/ne répond pas/) });
  });

  it('refuse une réponse qui ne respecte pas le contrat', async () => {
    fausseApi({ 'GET /api/auth/moi': { statut: 200, corps: { id: 'pas-un-uuid' } } });
    await expect(appeler(routesAuth.moi)).rejects.toThrow();
  });
});
