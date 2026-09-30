// Durée de vie d'une session (F-00, Q3) : 30 jours glissants, prolongés à l'usage, et jamais plus de
// 90 jours après la connexion.

const DAY_MS = 24 * 3600 * 1000;

export const SLIDING_DURATION_MS = 30 * DAY_MS;
export const MAX_DURATION_MS = 90 * DAY_MS;
/** On n'écrit la prolongation en base qu'au plus une fois par heure : pas une écriture par requête. */
export const RENEWAL_INTERVAL_MS = 3600 * 1000;

export interface SessionDeadlines {
  /** Échéance glissante, repoussée à l'usage. */
  expiresAt: Date;
  /** Échéance absolue, fixée à la connexion. */
  absoluteExpiresAt: Date;
}

export function initialDeadlines(now: Date): SessionDeadlines {
  return {
    expiresAt: new Date(now.getTime() + SLIDING_DURATION_MS),
    absoluteExpiresAt: new Date(now.getTime() + MAX_DURATION_MS),
  };
}

export function sessionExpired(s: SessionDeadlines, now: Date): boolean {
  const t = now.getTime();
  return t >= s.expiresAt.getTime() || t >= s.absoluteExpiresAt.getTime();
}

/**
 * Nouvelle échéance glissante si la session doit être prolongée, `null` sinon (déjà prolongée
 * il y a moins d'une heure). Jamais au-delà de l'échéance absolue.
 */
export function renewal(
  s: SessionDeadlines & { lastActivityAt: Date },
  now: Date,
): Date | null {
  if (now.getTime() - s.lastActivityAt.getTime() < RENEWAL_INTERVAL_MS) return null;
  const sliding = now.getTime() + SLIDING_DURATION_MS;
  return new Date(Math.min(sliding, s.absoluteExpiresAt.getTime()));
}

/** Durée de vie à donner au cookie : jusqu'à la plus proche des deux échéances. */
export function cookieDurationMs(s: SessionDeadlines, now: Date): number {
  return Math.max(0, Math.min(s.expiresAt.getTime(), s.absoluteExpiresAt.getTime()) - now.getTime());
}
