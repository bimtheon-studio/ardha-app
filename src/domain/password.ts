// Politique de mot de passe (F-00, Q2) : 12 à 128 caractères, aucune règle de composition, refus
// des mots de passe les plus courants. Inspirée du NIST SP 800-63B-4 (§ 3.1.1.2) : la longueur
// protège mieux que la composition, et un mot de passe connu des listes de fuite ne protège rien.

import { normalizeEmail } from './email.ts';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Mots de passe courants d'au moins 12 caractères (listes de fuites publiques, variantes
 * françaises). Les plus courants de tous sont plus courts et tombent déjà sous la longueur minimale.
 * Comparaison en minuscules, espaces retirés.
 */
const COMMON_PASSWORDS = new Set([
  '123456789012', '1234567890123', '12345678901234', '123456789123', '123123123123',
  '111111111111', '000000000000', '123412341234', '098765432109', '987654321098',
  'qwertyuiopas', 'qwertyuiop123', 'qwerty123456', 'qwertyqwerty', '1qaz2wsx3edc',
  'azertyuiopqs', 'azertyuiop12', 'azertyuiop123', 'azerty123456', 'azertyazerty',
  'motdepasse12', 'motdepasse123', 'motdepasse1234', 'motdepassemotdepasse',
  'password1234', 'password12345', 'password123456', 'passwordpassword', 'mypassword123',
  'iloveyou1234', 'jetaime123456', 'jetaimejetaime', 'bonjour123456', 'soleil123456',
  'administrateur', 'administrator', 'admin1234567', 'adminadmin123', 'welcome12345',
  'letmein12345', 'changeme1234', 'changemoi123', 'abcdefghijkl', 'abcdef123456',
  'aaaaaaaaaaaa', 'abc123abc123', 'football1234', 'baseball1234', 'superman1234',
  'ardha1234567', 'ardhaardha12', 'bimtheon1234', 'urbanisme123', 'urbanisme1234',
]);

export type PasswordProblem = 'too-short' | 'too-long' | 'too-common' | 'same-as-email';

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  'too-short': `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`,
  'too-long': `Le mot de passe doit faire au plus ${PASSWORD_MAX_LENGTH} caractères.`,
  'too-common': 'Ce mot de passe est trop courant : choisissez-en un autre.',
  'same-as-email': 'Le mot de passe ne doit pas être votre adresse e-mail.',
};

/** Longueur en caractères perçus (un emoji compte pour un), pas en unités UTF-16. */
function charCount(text: string): number {
  return [...text].length;
}

/** Rend le premier problème du mot de passe, ou `null` s'il est acceptable. */
export function passwordProblem(password: string, email?: string): PasswordProblem | null {
  const n = charCount(password);
  if (n < PASSWORD_MIN_LENGTH) return 'too-short';
  if (n > PASSWORD_MAX_LENGTH) return 'too-long';
  const simplified = password.toLowerCase().replace(/\s+/g, '');
  if (COMMON_PASSWORDS.has(simplified)) return 'too-common';
  if (email !== undefined && simplified === normalizeEmail(email).replace(/\s+/g, '')) return 'same-as-email';
  return null;
}
