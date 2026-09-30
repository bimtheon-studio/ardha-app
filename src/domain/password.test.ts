import { describe, expect, it } from 'vitest';

import { PASSWORD_MAX_LENGTH, PASSWORD_MESSAGES, passwordProblem } from './password.ts';

describe('problemeMotDePasse', () => {
  it('accepte 12 caractères sans règle de composition', () => {
    expect(passwordProblem('cheval pomme')).toBeNull();
    expect(passwordProblem('toutenminuscules')).toBeNull();
  });

  it('refuse moins de 12 caractères (l’ancien minimum de 6 ne suffit plus)', () => {
    expect(passwordProblem('abcdef')).toBe('too-short');
    expect(passwordProblem('onzecaracte')).toBe('too-short');
  });

  it('compte les caractères perçus, pas les unités UTF-16', () => {
    expect(passwordProblem('🐎'.repeat(11))).toBe('too-short');
    expect(passwordProblem('🐎'.repeat(12))).toBeNull();
  });

  it('refuse plus de 128 caractères', () => {
    expect(passwordProblem('a'.repeat(PASSWORD_MAX_LENGTH) + 'b')).toBe('too-long');
    expect(passwordProblem('ab'.repeat(PASSWORD_MAX_LENGTH / 2))).toBeNull();
  });

  it('refuse les mots de passe courants, quelle que soit la casse ou les espaces', () => {
    expect(passwordProblem('123456789012')).toBe('too-common');
    expect(passwordProblem('MotDePasse123')).toBe('too-common');
    expect(passwordProblem('azerty 123456')).toBe('too-common');
  });

  it('refuse l’adresse e-mail comme mot de passe', () => {
    expect(passwordProblem('Alice@exemple.fr', 'alice@exemple.fr')).toBe('same-as-email');
    expect(passwordProblem('alice@exemple.fr!', 'alice@exemple.fr')).toBeNull();
  });

  it('a un message en français pour chaque problème', () => {
    for (const message of Object.values(PASSWORD_MESSAGES)) expect(message).toMatch(/mot de passe/i);
  });
});
