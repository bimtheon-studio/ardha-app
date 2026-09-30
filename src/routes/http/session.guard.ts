// Garde global : toute route exige une session, sauf celles marquées `@Public()`. Sécurisé par
// défaut : une route oubliée est fermée, pas ouverte.
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role, User } from '../../contracts/index.ts';
import type { Request, Response } from 'express';

import { AuthService } from '../../accounts/auth.service.ts';
import { CONFIG, type Config } from '../../config/config.ts';
import { setSessionCookie } from './cookie.ts';

const PUBLIC = 'ardha:public';
const ROLE = 'ardha:role';

/** Route ouverte sans session. La session, si elle existe, est tout de même lue. */
export const Public = () => SetMetadata(PUBLIC, true);
export const RequiredRole = (role: Role) => SetMetadata(ROLE, role);

export interface AuthenticatedRequest extends Request {
  user?: User;
  sessionId?: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, targets) ?? false;
    const role = this.reflector.getAllAndOverride<Role | undefined>(ROLE, targets);
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (request.cookies as Record<string, string> | undefined)?.[this.config.SESSION_COOKIE_NAME];

    const current = await this.auth.currentSession(token);
    if (current) {
      request.user = current.user;
      request.sessionId = current.sessionId;
      if (current.renewedCookieMs !== undefined && token) {
        setSessionCookie(ctx.switchToHttp().getResponse<Response>(), this.config, token, current.renewedCookieMs);
      }
    }
    if (isPublic) return true;
    if (!current) throw new UnauthorizedException();
    if (role && current.user.role !== role) throw new ForbiddenException();
    return true;
  }
}
