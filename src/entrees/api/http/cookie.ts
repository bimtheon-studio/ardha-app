import type { Response } from 'express';

import type { Config } from '../../../config/config.ts';

/** Cookie de session : `httpOnly`, `SameSite=Lax`, `Secure` hors développement, nom suffixé par worktree. */
export function poserCookieSession(reponse: Response, config: Config, jeton: string, dureeMs: number): void {
  reponse.cookie(config.SESSION_COOKIE_NAME, jeton, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production,
    path: '/',
    maxAge: dureeMs,
  });
}

export function effacerCookieSession(reponse: Response, config: Config): void {
  reponse.clearCookie(config.SESSION_COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/' });
}
