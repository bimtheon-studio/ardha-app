import type { Response } from 'express';

import type { Config } from '../../config/config.ts';

/** Cookie de session : `httpOnly`, `SameSite=Lax`, `Secure` en production (sauf once sans TLS), nom suffixé par worktree. */
export function setSessionCookie(response: Response, config: Config, token: string, durationMs: number): void {
  response.cookie(config.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    maxAge: durationMs,
  });
}

export function clearSessionCookie(response: Response, config: Config): void {
  response.clearCookie(config.SESSION_COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/' });
}
