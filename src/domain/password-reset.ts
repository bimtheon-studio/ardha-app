// Lien de réinitialisation du mot de passe (F-00, Q9) : sans e-mail en v1, la CLI le crée et
// l'administrateur le transmet. À usage unique, valable 24 heures.

export const DUREE_LIEN_REINITIALISATION_MS = 24 * 3600 * 1000;

export function echeanceLien(maintenant: Date): Date {
  return new Date(maintenant.getTime() + DUREE_LIEN_REINITIALISATION_MS);
}

export interface LienReinitialisation {
  expireLe: Date;
  utiliseLe: Date | null;
}

export function lienUtilisable(lien: LienReinitialisation, maintenant: Date): boolean {
  return lien.utiliseLe === null && maintenant.getTime() < lien.expireLe.getTime();
}

/** URL du lien, côté front. Le jeton voyage dans l'ancre : il n'apparaît ni dans les journaux du serveur, ni dans le Referer. */
export function urlLienReinitialisation(origineWeb: string, jeton: string): string {
  return `${origineWeb.replace(/\/+$/, '')}/reset-password#${encodeURIComponent(jeton)}`;
}
