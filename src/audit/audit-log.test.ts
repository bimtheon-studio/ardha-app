import { describe, expect, it } from 'vitest';

import { MASQUE, masquerSecrets } from './audit-log.ts';

describe('masquerSecrets', () => {
  it('masque les clés qui ressemblent à un secret, à toute profondeur', () => {
    expect(
      masquerSecrets({
        email: 'a@b.fr',
        motDePasse: 'x',
        mot_de_passe: 'x',
        corps: { jeton: 'y', liste: [{ token: 'z', ok: 1 }] },
        cookie: 'c',
        motDePasseHash: 'h',
      }),
    ).toEqual({
      email: 'a@b.fr',
      motDePasse: MASQUE,
      mot_de_passe: MASQUE,
      corps: { jeton: MASQUE, liste: [{ token: MASQUE, ok: 1 }] },
      cookie: MASQUE,
      motDePasseHash: MASQUE,
    });
  });

  it('laisse passer les valeurs simples', () => {
    expect(masquerSecrets(3)).toBe(3);
    expect(masquerSecrets(null)).toBeNull();
  });
});
