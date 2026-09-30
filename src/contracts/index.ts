export * from './auth.ts';
export * from './openapi.ts';
export * from './routes.ts';
export * from './system.ts';

import { routesAuth } from './auth.ts';
import { routesSysteme } from './system.ts';

/** Toutes les routes de l'API. */
export const routes = { ...routesAuth, ...routesSysteme };
