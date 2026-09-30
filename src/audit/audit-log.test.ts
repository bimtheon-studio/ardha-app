import { describe, expect, it } from 'vitest';

import { MASK, maskSecrets } from './audit-log.ts';

describe('masquerSecrets', () => {
  it('masque les clés qui ressemblent à un secret, à toute profondeur', () => {
    expect(
      maskSecrets({
        email: 'a@b.fr',
        password: 'x',
        mot_de_passe: 'x',
        body: { token: 'y', list: [{ token: 'z', ok: 1 }] },
        cookie: 'c',
        passwordHash: 'h',
      }),
    ).toEqual({
      email: 'a@b.fr',
      password: MASK,
      mot_de_passe: MASK,
      body: { token: MASK, list: [{ token: MASK, ok: 1 }] },
      cookie: MASK,
      passwordHash: MASK,
    });
  });

  it('laisse passer les valeurs simples', () => {
    expect(maskSecrets(3)).toBe(3);
    expect(maskSecrets(null)).toBeNull();
  });
});
