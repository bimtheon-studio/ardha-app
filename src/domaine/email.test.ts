import { describe, expect, it } from 'vitest';

import { normaliserEmail } from './email.ts';

describe('normaliserEmail', () => {
  it('retire les espaces et passe en minuscules', () => {
    expect(normaliserEmail('  Alice.Martin@Exemple.FR ')).toBe('alice.martin@exemple.fr');
  });
});
