import { z } from 'zod';

import { route } from './routes.ts';

export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'unreachable']),
  redis: z.enum(['ok', 'unreachable']),
});
export type Health = z.infer<typeof Health>;

export const systemRoutes = {
  // Contrat de once : kamal-proxy et once vérifient `/up` avant de basculer le trafic (D-13).
  up: route({
    method: 'GET',
    path: '/up',
    summary: 'État de l’API et de ses dépendances (déploiement once, kamal-proxy, surveillance)',
    body: undefined,
    response: Health,
    status: 200,
    authenticated: false,
  }),
};
