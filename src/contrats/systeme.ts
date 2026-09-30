import { z } from 'zod';

import { route } from './routes.ts';

export const Sante = z.object({
  statut: z.enum(['ok', 'degrade']),
  base: z.enum(['ok', 'injoignable']),
  redis: z.enum(['ok', 'injoignable']),
});
export type Sante = z.infer<typeof Sante>;

export const routesSysteme = {
  sante: route({
    methode: 'GET',
    chemin: '/api/sante',
    resume: 'État de l’API et de ses dépendances',
    corps: undefined,
    reponse: Sante,
    statut: 200,
    authentifiee: false,
  }),
};
