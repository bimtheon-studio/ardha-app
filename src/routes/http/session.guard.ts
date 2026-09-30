// Garde global : toute route exige une session, sauf celles marquées `@Publique()`. Sécurisé par
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
import type { Role, Utilisateur } from '../../contracts/index.ts';
import type { Request, Response } from 'express';

import { AuthService } from '../../accounts/auth.service.ts';
import { CONFIG, type Config } from '../../config/config.ts';
import { poserCookieSession } from './cookie.ts';

const PUBLIQUE = 'ardha:publique';
const ROLE = 'ardha:role';

/** Route ouverte sans session. La session, si elle existe, est tout de même lue. */
export const Publique = () => SetMetadata(PUBLIQUE, true);
export const RoleRequis = (role: Role) => SetMetadata(ROLE, role);

export interface RequeteAuthentifiee extends Request {
  utilisateur?: Utilisateur;
  sessionId?: string;
}

export const UtilisateurCourant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<RequeteAuthentifiee>().utilisateur,
);

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    const publique = this.reflector.getAllAndOverride<boolean>(PUBLIQUE, cibles) ?? false;
    const role = this.reflector.getAllAndOverride<Role | undefined>(ROLE, cibles);
    const requete = ctx.switchToHttp().getRequest<RequeteAuthentifiee>();
    const jeton = (requete.cookies as Record<string, string> | undefined)?.[this.config.SESSION_COOKIE_NAME];

    const courante = await this.auth.sessionCourante(jeton);
    if (courante) {
      requete.utilisateur = courante.utilisateur;
      requete.sessionId = courante.sessionId;
      if (courante.nouvelleDureeCookieMs !== undefined && jeton) {
        poserCookieSession(ctx.switchToHttp().getResponse<Response>(), this.config, jeton, courante.nouvelleDureeCookieMs);
      }
    }
    if (publique) return true;
    if (!courante) throw new UnauthorizedException();
    if (role && courante.utilisateur.role !== role) throw new ForbiddenException();
    return true;
  }
}
