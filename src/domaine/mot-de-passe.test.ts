import { describe, expect, it } from 'vitest';

import { LONGUEUR_MAX_MOT_DE_PASSE, MESSAGES_MOT_DE_PASSE, problemeMotDePasse } from './mot-de-passe.ts';

describe('problemeMotDePasse', () => {
  it('accepte 12 caractères sans règle de composition', () => {
    expect(problemeMotDePasse('cheval pomme')).toBeNull();
    expect(problemeMotDePasse('toutenminuscules')).toBeNull();
  });

  it('refuse moins de 12 caractères (l’ancien minimum de 6 ne suffit plus)', () => {
    expect(problemeMotDePasse('abcdef')).toBe('trop-court');
    expect(problemeMotDePasse('onzecaracte')).toBe('trop-court');
  });

  it('compte les caractères perçus, pas les unités UTF-16', () => {
    expect(problemeMotDePasse('🐎'.repeat(11))).toBe('trop-court');
    expect(problemeMotDePasse('🐎'.repeat(12))).toBeNull();
  });

  it('refuse plus de 128 caractères', () => {
    expect(problemeMotDePasse('a'.repeat(LONGUEUR_MAX_MOT_DE_PASSE) + 'b')).toBe('trop-long');
    expect(problemeMotDePasse('ab'.repeat(LONGUEUR_MAX_MOT_DE_PASSE / 2))).toBeNull();
  });

  it('refuse les mots de passe courants, quelle que soit la casse ou les espaces', () => {
    expect(problemeMotDePasse('123456789012')).toBe('trop-courant');
    expect(problemeMotDePasse('MotDePasse123')).toBe('trop-courant');
    expect(problemeMotDePasse('azerty 123456')).toBe('trop-courant');
  });

  it('refuse l’adresse e-mail comme mot de passe', () => {
    expect(problemeMotDePasse('Alice@exemple.fr', 'alice@exemple.fr')).toBe('egal-email');
    expect(problemeMotDePasse('alice@exemple.fr!', 'alice@exemple.fr')).toBeNull();
  });

  it('a un message en français pour chaque problème', () => {
    for (const message of Object.values(MESSAGES_MOT_DE_PASSE)) expect(message).toMatch(/mot de passe/i);
  });
});
