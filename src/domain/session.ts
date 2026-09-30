// Durée de vie d'une session (F-00, Q3) : 30 jours glissants, prolongés à l'usage, et jamais plus de
// 90 jours après la connexion.

const JOUR_MS = 24 * 3600 * 1000;

export const DUREE_GLISSANTE_MS = 30 * JOUR_MS;
export const DUREE_MAX_MS = 90 * JOUR_MS;
/** On n'écrit la prolongation en base qu'au plus une fois par heure : pas une écriture par requête. */
export const INTERVALLE_PROLONGATION_MS = 3600 * 1000;

export interface EcheancesSession {
  /** Échéance glissante, repoussée à l'usage. */
  expireLe: Date;
  /** Échéance absolue, fixée à la connexion. */
  expireAuPlusTardLe: Date;
}

export function echeancesInitiales(maintenant: Date): EcheancesSession {
  return {
    expireLe: new Date(maintenant.getTime() + DUREE_GLISSANTE_MS),
    expireAuPlusTardLe: new Date(maintenant.getTime() + DUREE_MAX_MS),
  };
}

export function sessionExpiree(s: EcheancesSession, maintenant: Date): boolean {
  const t = maintenant.getTime();
  return t >= s.expireLe.getTime() || t >= s.expireAuPlusTardLe.getTime();
}

/**
 * Nouvelle échéance glissante si la session doit être prolongée, `null` sinon (déjà prolongée
 * il y a moins d'une heure). Jamais au-delà de l'échéance absolue.
 */
export function prolongation(
  s: EcheancesSession & { derniereActiviteLe: Date },
  maintenant: Date,
): Date | null {
  if (maintenant.getTime() - s.derniereActiviteLe.getTime() < INTERVALLE_PROLONGATION_MS) return null;
  const glissante = maintenant.getTime() + DUREE_GLISSANTE_MS;
  return new Date(Math.min(glissante, s.expireAuPlusTardLe.getTime()));
}

/** Durée de vie à donner au cookie : jusqu'à la plus proche des deux échéances. */
export function dureeCookieMs(s: EcheancesSession, maintenant: Date): number {
  return Math.max(0, Math.min(s.expireLe.getTime(), s.expireAuPlusTardLe.getTime()) - maintenant.getTime());
}
