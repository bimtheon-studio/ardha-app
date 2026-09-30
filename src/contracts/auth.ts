// Contrat de l'authentification (F-00) : inscription, connexion, déconnexion, « qui suis-je »,
// réinitialisation du mot de passe par lien.
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MESSAGES, passwordProblem } from '../domain/index.ts';
import { z } from 'zod';

import { route } from './routes.ts';

export const Role = z.enum(['admin', 'user']);
export type Role = z.infer<typeof Role>;

export const User = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: Role,
});
export type User = z.infer<typeof User>;

const emailField = z
  .string({ error: 'L’adresse e-mail est obligatoire.' })
  .trim()
  .min(1, 'L’adresse e-mail est obligatoire.')
  .max(EMAIL_MAX_LENGTH, 'Adresse e-mail trop longue.')
  .pipe(z.email('Adresse e-mail invalide.'));

/** Mot de passe soumis à la politique (inscription, réinitialisation). */
const newPassword = z.string({ error: 'Le mot de passe est obligatoire.' });

function checkPolicy(password: string, email: string | undefined, ctx: z.RefinementCtx): void {
  const problem = passwordProblem(password, email);
  if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: PASSWORD_MESSAGES[problem] });
}

export const Signup = z
  .object({
    email: emailField,
    name: z
      .string({ error: 'Le nom est obligatoire.' })
      .trim()
      .min(1, 'Le nom est obligatoire.')
      .max(120, 'Le nom doit faire au plus 120 caractères.'),
    password: newPassword,
  })
  .superRefine((v, ctx) => checkPolicy(v.password, v.email, ctx));
export type Signup = z.infer<typeof Signup>;

export const Login = z.object({
  email: emailField,
  // Pas de politique à la connexion : seulement une borne, pour ne pas hacher un texte démesuré.
  password: z
    .string({ error: 'Le mot de passe est obligatoire.' })
    .min(1, 'Le mot de passe est obligatoire.')
    .max(PASSWORD_MAX_LENGTH * 4, 'Mot de passe trop long.'),
});
export type Login = z.infer<typeof Login>;

export const PasswordReset = z
  .object({
    token: z.string().min(1, 'Lien incomplet.').max(200, 'Lien invalide.'),
    password: newPassword,
  })
  .superRefine((v, ctx) => checkPolicy(v.password, undefined, ctx));
export type PasswordReset = z.infer<typeof PasswordReset>;

export const authRoutes = {
  signup: route({
    method: 'POST',
    path: '/api/auth/signup',
    summary: 'Crée un compte et ouvre une session',
    body: Signup,
    response: User,
    status: 201,
    authenticated: false,
  }),
  login: route({
    method: 'POST',
    path: '/api/auth/login',
    summary: 'Ouvre une session',
    body: Login,
    response: User,
    status: 200,
    authenticated: false,
  }),
  logout: route({
    method: 'POST',
    path: '/api/auth/logout',
    summary: 'Ferme la session courante',
    body: undefined,
    response: undefined,
    status: 204,
    authenticated: false,
  }),
  me: route({
    method: 'GET',
    path: '/api/auth/me',
    summary: 'Utilisateur de la session courante',
    body: undefined,
    response: User,
    status: 200,
    authenticated: true,
  }),
  passwordReset: route({
    method: 'POST',
    path: '/api/auth/password-reset',
    summary: 'Change le mot de passe avec un lien à usage unique, et ferme toutes les sessions',
    body: PasswordReset,
    response: undefined,
    status: 204,
    authenticated: false,
  }),
};
