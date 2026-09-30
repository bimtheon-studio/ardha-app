export * from './auth.ts';
export * from './openapi.ts';
export * from './routes.ts';
export * from './system.ts';

import { authRoutes } from './auth.ts';
import { systemRoutes } from './system.ts';

/** Toutes les routes de l'API. */
export const routes = { ...authRoutes, ...systemRoutes };
