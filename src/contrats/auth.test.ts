import { describe, expect, it } from 'vitest';

import { Connexion, Inscription, Reinitialisation } from './auth.ts';
import { messagesParChamp } from './routes.ts';

const erreurs = (r: { success: boolean; error?: unknown }) =>
  r.success ? {} : messagesParChamp(r.error as Parameters<typeof messagesParChamp>[0]);

describe('Inscription', () => {
  const valide = { email: ' Alice@Exemple.fr ', nom: ' Alice Martin ', motDePasse: 'cheval pomme agrafe' };

  it('accepte une inscription complète, espaces retirés', () => {
    const r = Inscription.safeParse(valide);
    expect(r.success && r.data).toEqual({ email: 'Alice@Exemple.fr', nom: 'Alice Martin', motDePasse: valide.motDePasse });
  });

  it('exige le nom (F-00, Q4)', () => {
    expect(erreurs(Inscription.safeParse({ ...valide, nom: '   ' }))).toEqual({ nom: 'Le nom est obligatoire.' });
  });

  it('applique la politique de mot de passe, message en français', () => {
    expect(erreurs(Inscription.safeParse({ ...valide, motDePasse: 'court' }))).toEqual({
      motDePasse: 'Le mot de passe doit faire au moins 12 caractères.',
    });
    expect(erreurs(Inscription.safeParse({ ...valide, motDePasse: 'alice@exemple.fr' }))).toEqual({
      motDePasse: 'Le mot de passe ne doit pas être votre adresse e-mail.',
    });
  });

  it('refuse une adresse invalide ou absente', () => {
    expect(erreurs(Inscription.safeParse({ ...valide, email: 'alice' }))).toEqual({ email: 'Adresse e-mail invalide.' });
    expect(erreurs(Inscription.safeParse({ nom: 'A', motDePasse: valide.motDePasse }))).toMatchObject({
      email: 'L’adresse e-mail est obligatoire.',
    });
  });
});

describe('Connexion', () => {
  it('n’applique pas la politique : un ancien mot de passe court reste saisissable', () => {
    expect(Connexion.safeParse({ email: 'a@b.fr', motDePasse: 'court' }).success).toBe(true);
  });

  it('exige un mot de passe', () => {
    expect(erreurs(Connexion.safeParse({ email: 'a@b.fr', motDePasse: '' }))).toEqual({
      motDePasse: 'Le mot de passe est obligatoire.',
    });
  });

  it('borne la longueur, pour ne pas hacher un texte démesuré', () => {
    expect(Connexion.safeParse({ email: 'a@b.fr', motDePasse: 'x'.repeat(10_000) }).success).toBe(false);
  });
});

describe('Reinitialisation', () => {
  it('exige un jeton et un mot de passe conforme', () => {
    expect(Reinitialisation.safeParse({ jeton: 'j', motDePasse: 'cheval pomme agrafe' }).success).toBe(true);
    expect(erreurs(Reinitialisation.safeParse({ jeton: '', motDePasse: '123456789012' }))).toEqual({
      jeton: 'Lien incomplet.',
      motDePasse: 'Ce mot de passe est trop courant : choisissez-en un autre.',
    });
  });
});
