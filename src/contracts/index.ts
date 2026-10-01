export * from './auth.ts';
export * from './geo.ts';
export * from './openapi.ts';
export * from './routes.ts';
export * from './studies.ts';
export * from './system.ts';

import { authRoutes } from './auth.ts';
import { geoRoutes } from './geo.ts';
import { studyRoutes } from './studies.ts';
import { systemRoutes } from './system.ts';

/** Toutes les routes de l'API. */
export const routes = { ...authRoutes, ...geoRoutes, ...studyRoutes, ...systemRoutes };
