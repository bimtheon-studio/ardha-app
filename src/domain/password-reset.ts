// Lien de réinitialisation du mot de passe (F-00, Q9) : sans e-mail en v1, la CLI le crée et
// l'administrateur le transmet. À usage unique, valable 24 heures.

export const RESET_LINK_DURATION_MS = 24 * 3600 * 1000;

export function linkDeadline(now: Date): Date {
  return new Date(now.getTime() + RESET_LINK_DURATION_MS);
}

export interface ResetLink {
  expiresAt: Date;
  usedAt: Date | null;
}

export function linkUsable(link: ResetLink, now: Date): boolean {
  return link.usedAt === null && now.getTime() < link.expiresAt.getTime();
}

/** URL du lien, côté front. Le jeton voyage dans l'ancre : il n'apparaît ni dans les journaux du serveur, ni dans le Referer. */
export function resetLinkUrl(webOrigin: string, token: string): string {
  return `${webOrigin.replace(/\/+$/, '')}/reset-password#${encodeURIComponent(token)}`;
}
