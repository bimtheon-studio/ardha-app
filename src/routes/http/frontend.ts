// Front construit (`frontend/dist`) servi par l'API, à la même origine : le cookie `SameSite=Lax` et
// le contrôle de l'en-tête Origin le supposent (lot LD). Les fichiers de `/assets`, nommés par leur
// empreinte, se gardent un an ; `index.html` se revalide à chaque visite, pour qu'un déploiement
// soit vu tout de suite. Toute autre page GET hors de `/api` et `/up` reçoit `index.html` (routeur
// du front).
import path from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

function backendPath(p: string): boolean {
  return p === '/up' || p === '/api' || p.startsWith('/api/') || p.startsWith('/assets/');
}

export function serveFrontend(app: NestExpressApplication, dir: string): void {
  const assets = path.join(dir, 'assets');
  app.useStaticAssets(dir, {
    index: false,
    // Posé avant celui de `send`, qui ne l'écrase pas.
    setHeaders: (res, file) => res.setHeader('Cache-Control', file.startsWith(assets + path.sep) ? IMMUTABLE : REVALIDATE),
  });
  const index = path.join(dir, 'index.html');
  app.use((request: Request, response: Response, next: NextFunction) => {
    if ((request.method !== 'GET' && request.method !== 'HEAD') || backendPath(request.path)) return next();
    response.sendFile(index, { cacheControl: false, headers: { 'Cache-Control': REVALIDATE } });
  });
}
