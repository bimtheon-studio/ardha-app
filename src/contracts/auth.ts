// Contrat de l'authentification (F-00) : inscription, connexion, déconnexion, « qui suis-je »,
// réinitialisation du mot de passe par lien.
import { LONGUEUR_MAX_EMAIL, LONGUEUR_MAX_MOT_DE_PASSE, MESSAGES_MOT_DE_PASSE, problemeMotDePasse } from '../domain/index.ts';
import { z } from 'zod';

import { route } from './routes.ts';

export const Role = z.enum(['admin', 'utilisateur']);
export type Role = z.infer<typeof Role>;

export const Utilisateur = z.object({
  id: z.uuid(),
  email: z.string(),
  nom: z.string(),
  role: Role,
});
export type Utilisateur = z.infer<typeof Utilisateur>;

const champEmail = z
  .string({ error: 'L’adresse e-mail est obligatoire.' })
  .trim()
  .min(1, 'L’adresse e-mail est obligatoire.')
  .max(LONGUEUR_MAX_EMAIL, 'Adresse e-mail trop longue.')
  .pipe(z.email('Adresse e-mail invalide.'));

/** Mot de passe soumis à la politique (inscription, réinitialisation). */
const nouveauMotDePasse = z.string({ error: 'Le mot de passe est obligatoire.' });

function verifierPolitique(motDePasse: string, email: string | undefined, ctx: z.RefinementCtx): void {
  const probleme = problemeMotDePasse(motDePasse, email);
  if (probleme) ctx.addIssue({ code: 'custom', path: ['motDePasse'], message: MESSAGES_MOT_DE_PASSE[probleme] });
}

export const Inscription = z
  .object({
    email: champEmail,
    nom: z
      .string({ error: 'Le nom est obligatoire.' })
      .trim()
      .min(1, 'Le nom est obligatoire.')
      .max(120, 'Le nom doit faire au plus 120 caractères.'),
    motDePasse: nouveauMotDePasse,
  })
  .superRefine((v, ctx) => verifierPolitique(v.motDePasse, v.email, ctx));
export type Inscription = z.infer<typeof Inscription>;

export const Connexion = z.object({
  email: champEmail,
  // Pas de politique à la connexion : seulement une borne, pour ne pas hacher un texte démesuré.
  motDePasse: z
    .string({ error: 'Le mot de passe est obligatoire.' })
    .min(1, 'Le mot de passe est obligatoire.')
    .max(LONGUEUR_MAX_MOT_DE_PASSE * 4, 'Mot de passe trop long.'),
});
export type Connexion = z.infer<typeof Connexion>;

export const Reinitialisation = z
  .object({
    jeton: z.string().min(1, 'Lien incomplet.').max(200, 'Lien invalide.'),
    motDePasse: nouveauMotDePasse,
  })
  .superRefine((v, ctx) => verifierPolitique(v.motDePasse, undefined, ctx));
export type Reinitialisation = z.infer<typeof Reinitialisation>;

export const routesAuth = {
  signup: route({
    methode: 'POST',
    chemin: '/api/auth/signup',
    resume: 'Crée un compte et ouvre une session',
    corps: Inscription,
    reponse: Utilisateur,
    statut: 201,
    authentifiee: false,
  }),
  login: route({
    methode: 'POST',
    chemin: '/api/auth/login',
    resume: 'Ouvre une session',
    corps: Connexion,
    reponse: Utilisateur,
    statut: 200,
    authentifiee: false,
  }),
  logout: route({
    methode: 'POST',
    chemin: '/api/auth/logout',
    resume: 'Ferme la session courante',
    corps: undefined,
    reponse: undefined,
    statut: 204,
    authentifiee: false,
  }),
  me: route({
    methode: 'GET',
    chemin: '/api/auth/me',
    resume: 'Utilisateur de la session courante',
    corps: undefined,
    reponse: Utilisateur,
    statut: 200,
    authentifiee: true,
  }),
  passwordReset: route({
    methode: 'POST',
    chemin: '/api/auth/password-reset',
    resume: 'Change le mot de passe avec un lien à usage unique, et ferme toutes les sessions',
    corps: Reinitialisation,
    reponse: undefined,
    statut: 204,
    authentifiee: false,
  }),
};
