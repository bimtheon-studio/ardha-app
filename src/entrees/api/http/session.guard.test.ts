import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthService, SessionCourante } from '../../../comptes/auth.service.ts';
import { lireConfig } from '../../../config/config.ts';
import { Publique, RoleRequis, SessionGuard } from './session.guard.ts';

const config = lireConfig({ DATABASE_URL: 'postgres://x@h/b', REDIS_URL: 'redis://h', WEB_ORIGIN: 'http://w' });

class Controleur {
  @RoleRequis('admin') admin() {}
  @Publique() ouverte() {}
  fermee() {}
}

function contexte(methode: keyof Controleur, cookie?: string) {
  const requete: Record<string, unknown> = { cookies: cookie ? { ardha_session: cookie } : {} };
  const reponse = { cookie: vi.fn() };
  const ctx = {
    getHandler: () => Controleur.prototype[methode],
    getClass: () => Controleur,
    switchToHttp: () => ({ getRequest: () => requete, getResponse: () => reponse }),
  } as unknown as ExecutionContext;
  return { ctx, requete, reponse };
}

function garde(courante: SessionCourante | null) {
  const auth = { sessionCourante: vi.fn().mockResolvedValue(courante) } as unknown as AuthService;
  return new SessionGuard(new Reflector(), auth, config);
}

const alice = { id: '0190', email: 'a@b.fr', nom: 'A', role: 'utilisateur' as const };

describe('SessionGuard', () => {
  it('ferme par défaut une route sans session', async () => {
    await expect(garde(null).canActivate(contexte('fermee').ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ouvre une route publique, et y lit tout de même la session', async () => {
    const { ctx, requete } = contexte('ouverte', 'jeton');
    await expect(garde({ utilisateur: alice, sessionId: 's' }).canActivate(ctx)).resolves.toBe(true);
    expect(requete.utilisateur).toEqual(alice);
  });

  it('exige le rôle demandé', async () => {
    await expect(garde({ utilisateur: alice, sessionId: 's' }).canActivate(contexte('admin', 'j').ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      garde({ utilisateur: { ...alice, role: 'admin' }, sessionId: 's' }).canActivate(contexte('admin', 'j').ctx),
    ).resolves.toBe(true);
  });

  it('reprolonge le cookie quand la session vient d’être prolongée', async () => {
    const { ctx, reponse } = contexte('fermee', 'jeton');
    await garde({ utilisateur: alice, sessionId: 's', nouvelleDureeCookieMs: 1000 }).canActivate(ctx);
    expect(reponse.cookie).toHaveBeenCalledWith('ardha_session', 'jeton', expect.objectContaining({ maxAge: 1000, httpOnly: true }));
  });
});
