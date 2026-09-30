// Routes de l'authentification, conformes à `routesAuth` du contrat.
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Connexion, Inscription, Reinitialisation, routesAuth, type Utilisateur } from '../../contrats/index.ts';
import type { Request, Response } from 'express';

import { CONFIG, type Config } from '../../config/config.ts';
import { effacerCookieSession, poserCookieSession } from './http/cookie.ts';
import { Limiteur } from './http/limiteur.ts';
import { Publique, UtilisateurCourant } from './http/session.guard.ts';
import { Valider } from './http/validation.ts';
import { AuthService, type ContexteRequete } from '../../comptes/auth.service.ts';

const r = routesAuth;
const chemin = (c: string) => c.replace(/^\/api\/auth\//, '');

function contexte(requete: Request): ContexteRequete {
  return { ip: requete.ip ?? null, agentUtilisateur: requete.headers['user-agent'] ?? null };
}

@Controller('api/auth')
@UseGuards(Limiteur)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Post(chemin(r.inscription.chemin))
  @HttpCode(r.inscription.statut)
  @Publique()
  @SkipThrottle({ email: true })
  async inscription(
    @Body(new Valider(Inscription)) corps: Inscription,
    @Req() requete: Request,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<Utilisateur> {
    const ouverte = await this.auth.inscrire(corps, contexte(requete));
    poserCookieSession(reponse, this.config, ouverte.jeton, ouverte.dureeCookieMs);
    return ouverte.utilisateur;
  }

  @Post(chemin(r.connexion.chemin))
  @HttpCode(r.connexion.statut)
  @Publique()
  async connexion(
    @Body(new Valider(Connexion)) corps: Connexion,
    @Req() requete: Request,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<Utilisateur> {
    const ouverte = await this.auth.connecter(corps, contexte(requete));
    poserCookieSession(reponse, this.config, ouverte.jeton, ouverte.dureeCookieMs);
    return ouverte.utilisateur;
  }

  @Post(chemin(r.deconnexion.chemin))
  @HttpCode(r.deconnexion.statut)
  @Publique()
  @SkipThrottle({ ip: true, email: true })
  async deconnexion(@Req() requete: Request, @Res({ passthrough: true }) reponse: Response): Promise<void> {
    const jeton = (requete.cookies as Record<string, string> | undefined)?.[this.config.SESSION_COOKIE_NAME];
    await this.auth.deconnecter(jeton, contexte(requete));
    effacerCookieSession(reponse, this.config);
  }

  @Get(chemin(r.moi.chemin))
  @HttpCode(r.moi.statut)
  @SkipThrottle({ ip: true, email: true })
  moi(@UtilisateurCourant() utilisateur: Utilisateur): Utilisateur {
    return utilisateur;
  }

  @Post(chemin(r.reinitialisation.chemin))
  @HttpCode(r.reinitialisation.statut)
  @Publique()
  @SkipThrottle({ email: true })
  async reinitialisation(
    @Body(new Valider(Reinitialisation)) corps: Reinitialisation,
    @Req() requete: Request,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<void> {
    await this.auth.reinitialiser(corps, contexte(requete));
    effacerCookieSession(reponse, this.config);
  }
}
