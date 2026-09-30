// Adresse e-mail : une seule forme en base, pour qu'une majuscule ne crée pas un second compte.

export const LONGUEUR_MAX_EMAIL = 254;

/** Forme canonique : sans espaces autour, en minuscules (partie locale comprise, comme Supabase). */
export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase();
}
