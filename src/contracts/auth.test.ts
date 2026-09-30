import { describe, expect, it } from 'vitest';

import { Login, Signup, PasswordReset } from './auth.ts';
import { messagesByField } from './routes.ts';

const errors = (r: { success: boolean; error?: unknown }) =>
  r.success ? {} : messagesByField(r.error as Parameters<typeof messagesByField>[0]);

describe('Inscription', () => {
  const valid = { email: ' Alice@Exemple.fr ', name: ' Alice Martin ', password: 'cheval pomme agrafe' };

  it('accepte une inscription complète, espaces retirés', () => {
    const r = Signup.safeParse(valid);
    expect(r.success && r.data).toEqual({ email: 'Alice@Exemple.fr', name: 'Alice Martin', password: valid.password });
  });

  it('exige le nom (F-00, Q4)', () => {
    expect(errors(Signup.safeParse({ ...valid, name: '   ' }))).toEqual({ name: 'Le nom est obligatoire.' });
  });

  it('applique la politique de mot de passe, message en français', () => {
    expect(errors(Signup.safeParse({ ...valid, password: 'court' }))).toEqual({
      password: 'Le mot de passe doit faire au moins 12 caractères.',
    });
    expect(errors(Signup.safeParse({ ...valid, password: 'alice@exemple.fr' }))).toEqual({
      password: 'Le mot de passe ne doit pas être votre adresse e-mail.',
    });
  });

  it('refuse une adresse invalide ou absente', () => {
    expect(errors(Signup.safeParse({ ...valid, email: 'alice' }))).toEqual({ email: 'Adresse e-mail invalide.' });
    expect(errors(Signup.safeParse({ name: 'A', password: valid.password }))).toMatchObject({
      email: 'L’adresse e-mail est obligatoire.',
    });
  });
});

describe('Connexion', () => {
  it('n’applique pas la politique : un ancien mot de passe court reste saisissable', () => {
    expect(Login.safeParse({ email: 'a@b.fr', password: 'court' }).success).toBe(true);
  });

  it('exige un mot de passe', () => {
    expect(errors(Login.safeParse({ email: 'a@b.fr', password: '' }))).toEqual({
      password: 'Le mot de passe est obligatoire.',
    });
  });

  it('borne la longueur, pour ne pas hacher un texte démesuré', () => {
    expect(Login.safeParse({ email: 'a@b.fr', password: 'x'.repeat(10_000) }).success).toBe(false);
  });
});

describe('Reinitialisation', () => {
  it('exige un jeton et un mot de passe conforme', () => {
    expect(PasswordReset.safeParse({ token: 'j', password: 'cheval pomme agrafe' }).success).toBe(true);
    expect(errors(PasswordReset.safeParse({ token: '', password: '123456789012' }))).toEqual({
      token: 'Lien incomplet.',
      password: 'Ce mot de passe est trop courant : choisissez-en un autre.',
    });
  });
});
