// Protection contre les requêtes intersites (CSRF), en plus du cookie `SameSite=Lax` : une requête
// qui modifie quelque chose doit venir du front d'Ardha, et parler JSON.
import { ForbiddenException, HttpException, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { CONFIG, type Config } from '../../config/config.ts';

const SURES = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class ControleOrigine implements NestMiddleware {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  use(requete: Request, _reponse: Response, suite: NextFunction): void {
    if (SURES.has(requete.method)) return suite();
    const origine = requete.headers.origin;
    if (origine !== undefined && origine !== new URL(this.config.WEB_ORIGIN).origin) throw new ForbiddenException();
    if (requete.headers['sec-fetch-site'] === 'cross-site') throw new ForbiddenException();
    const type = requete.headers['content-type'];
    if (Number(requete.headers['content-length'] ?? 0) > 0 && !type?.startsWith('application/json')) {
      throw new HttpException('Unsupported Media Type', 415);
    }
    suite();
  }
}
