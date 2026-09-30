import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthService, CurrentSession } from '../../accounts/auth.service.ts';
import { readConfig } from '../../config/config.ts';
import { Public, RequiredRole, SessionGuard } from './session.guard.ts';

const config = readConfig({ DATABASE_URL: 'postgres://x@h/b', REDIS_URL: 'redis://h', WEB_ORIGIN: 'http://w' });

class Handlers {
  @RequiredRole('admin') admin() {}
  @Public() opened() {}
  closed() {}
}

function context(method: keyof Handlers, cookie?: string) {
  const request: Record<string, unknown> = { cookies: cookie ? { ardha_session: cookie } : {} };
  const response = { cookie: vi.fn() };
  const ctx = {
    getHandler: () => Handlers.prototype[method],
    getClass: () => Handlers,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { ctx, request, response };
}

function guard(current: CurrentSession | null) {
  const auth = { currentSession: vi.fn().mockResolvedValue(current) } as unknown as AuthService;
  return new SessionGuard(new Reflector(), auth, config);
}

const alice = { id: '0190', email: 'a@b.fr', name: 'A', role: 'user' as const };

describe('SessionGuard', () => {
  it('ferme par défaut une route sans session', async () => {
    await expect(guard(null).canActivate(context('closed').ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ouvre une route publique, et y lit tout de même la session', async () => {
    const { ctx, request } = context('opened', 'jeton');
    await expect(guard({ user: alice, sessionId: 's' }).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual(alice);
  });

  it('exige le rôle demandé', async () => {
    await expect(guard({ user: alice, sessionId: 's' }).canActivate(context('admin', 'j').ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      guard({ user: { ...alice, role: 'admin' }, sessionId: 's' }).canActivate(context('admin', 'j').ctx),
    ).resolves.toBe(true);
  });

  it('reprolonge le cookie quand la session vient d’être prolongée', async () => {
    const { ctx, response } = context('closed', 'jeton');
    await guard({ user: alice, sessionId: 's', renewedCookieMs: 1000 }).canActivate(ctx);
    expect(response.cookie).toHaveBeenCalledWith('ardha_session', 'jeton', expect.objectContaining({ maxAge: 1000, httpOnly: true }));
  });
});
