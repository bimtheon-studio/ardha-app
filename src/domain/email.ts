// Adresse e-mail : une seule forme en base, pour qu'une majuscule ne crée pas un second compte.

export const EMAIL_MAX_LENGTH = 254;

/** Forme canonique : sans espaces autour, en minuscules (partie locale comprise, comme Supabase). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
