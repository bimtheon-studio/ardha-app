// Toute erreur sort au format `ApiError` du contrat : un message pour l'utilisateur, en français,
// et au besoin un message par champ. Les erreurs imprévues sont journalisées, jamais détaillées.
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ApiError } from '../../contracts/index.ts';
import type { Response } from 'express';

import { ERRORS, DomainError } from '../../shared/errors.ts';

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
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Erreurs');

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.translate(error);
    if (status >= 500) this.logger.error(error instanceof Error ? error.stack : String(error));
    response.status(status).json(body);
  }

  private translate(error: unknown): { status: number; body: ApiError } {
    if (error instanceof DomainError) {
      return {
        status: ERRORS[error.code].status,
        body: { message: error.message, ...(error.fields && { fields: error.fields }) },
      };
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const r = error.getResponse();
      if (typeof r === 'object' && r && 'fields' in r && 'message' in r) return { status, body: r as ApiError };
      const userMessage = typeof r === 'object' && r && 'userMessage' in r ? String((r as { userMessage: unknown }).userMessage) : undefined;
      return { status, body: { message: userMessage ?? MESSAGES_HTTP[status] ?? 'La requête a échoué.' } };
    }
    return { status: 500, body: { message: 'Une erreur interne est survenue. Réessayez dans un instant.' } };
  }
}
