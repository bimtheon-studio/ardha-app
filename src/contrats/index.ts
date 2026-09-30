export * from './auth.ts';
export * from './openapi.ts';
export * from './routes.ts';
export * from './systeme.ts';

import { routesAuth } from './auth.ts';
import { routesSysteme } from './systeme.ts';

/** Toutes les routes de l'API. */
export const routes = { ...routesAuth, ...routesSysteme };
