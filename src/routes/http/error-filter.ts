// Toute erreur sort au format `ErreurApi` du contrat : un message pour l'utilisateur, en français,
// et au besoin un message par champ. Les erreurs imprévues sont journalisées, jamais détaillées.
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ErreurApi } from '../../contracts/index.ts';
import type { Response } from 'express';

import { ERREURS, ErreurMetier } from '../../shared/errors.ts';

const MESSAGES_HTTP: Record<number, string> = {
  400: 'Requête invalide.',
  401: 'Vous devez vous connecter.',
  403: 'Accès refusé.',
  404: 'Ressource introuvable.',
  413: 'Requête trop volumineuse.',
  415: 'Format de requête non pris en charge.',
  429: 'Trop de tentatives. Réessayez plus tard.',
};

@Catch()
export class FiltreErreurs implements ExceptionFilter {
  private readonly logger = new Logger('Erreurs');

  catch(erreur: unknown, hote: ArgumentsHost): void {
    const reponse = hote.switchToHttp().getResponse<Response>();
    const { statut, corps } = this.traduire(erreur);
    if (statut >= 500) this.logger.error(erreur instanceof Error ? erreur.stack : String(erreur));
    reponse.status(statut).json(corps);
  }

  private traduire(erreur: unknown): { statut: number; corps: ErreurApi } {
    if (erreur instanceof ErreurMetier) {
      return {
        statut: ERREURS[erreur.code].statut,
        corps: { message: erreur.message, ...(erreur.champs && { champs: erreur.champs }) },
      };
    }
    if (erreur instanceof HttpException) {
      const statut = erreur.getStatus();
      const r = erreur.getResponse();
      if (typeof r === 'object' && r && 'champs' in r && 'message' in r) return { statut, corps: r as ErreurApi };
      const propre = typeof r === 'object' && r && 'messageFr' in r ? String((r as { messageFr: unknown }).messageFr) : undefined;
      return { statut, corps: { message: propre ?? MESSAGES_HTTP[statut] ?? 'La requête a échoué.' } };
    }
    return { statut: 500, corps: { message: 'Une erreur interne est survenue. Réessayez dans un instant.' } };
  }
}
