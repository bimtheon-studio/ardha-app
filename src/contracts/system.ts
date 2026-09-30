import { z } from 'zod';

import { route } from './routes.ts';

export const Health = z.object({
  status: z.enum(['ok', 'degrade']),
  db: z.enum(['ok', 'injoignable']),
  redis: z.enum(['ok', 'injoignable']),
});
export type Health = z.infer<typeof Health>;

export const systemRoutes = {
  health: route({
    method: 'GET',
    path: '/api/health',
    summary: 'État de l’API et de ses dépendances',
    body: undefined,
    response: Health,
    status: 200,
    authenticated: false,
  }),
};
