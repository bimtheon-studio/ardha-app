import { describe, expect, it } from 'vitest';

import { normalizeEmail } from './email.ts';

describe('normaliserEmail', () => {
  it('retire les espaces et passe en minuscules', () => {
    expect(normalizeEmail('  Alice.Martin@Exemple.FR ')).toBe('alice.martin@exemple.fr');
  });
});
