// Protection contre les requêtes intersites (CSRF), en plus du cookie `SameSite=Lax` : une requête
// qui modifie quelque chose doit venir du front d'Ardha, et parler JSON.
import { ForbiddenException, HttpException, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { CONFIG, type Config } from '../../config/config.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginCheck implements NestMiddleware {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(request.method)) return next();
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== new URL(this.config.WEB_ORIGIN).origin) throw new ForbiddenException();
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new ForbiddenException();
    const type = request.headers['content-type'];
    if (Number(request.headers['content-length'] ?? 0) > 0 && !type?.startsWith('application/json')) {
      throw new HttpException('Unsupported Media Type', 415);
    }
    next();
  }
}
