// Document OpenAPI 3.1, dérivé des routes décrites dans ce paquet.
import { z } from 'zod';

import { ErreurApi, type Route } from './routes.ts';

type Document = Record<string, unknown> & { paths: Record<string, Record<string, unknown>> };

function schema(s: z.ZodType, io: 'input' | 'output'): unknown {
  return z.toJSONSchema(s, { io, unrepresentable: 'any' });
}

export function documentOpenApi(routes: Record<string, Route>, version: string): Document {
  const doc: Document = {
    openapi: '3.1.0',
    info: { title: 'API Ardha', version },
    components: {
      securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'ardha_session' } },
    },
    paths: {},
  };
  for (const [nom, r] of Object.entries(routes)) {
    const operation: Record<string, unknown> = {
      operationId: nom,
      summary: r.resume,
      responses: {
        [r.statut]: r.reponse
          ? { description: 'Succès', content: { 'application/json': { schema: schema(r.reponse, 'output') } } }
          : { description: 'Succès, sans contenu' },
        default: { description: 'Erreur', content: { 'application/json': { schema: schema(ErreurApi, 'output') } } },
      },
    };
    if (r.corps) {
      operation.requestBody = { required: true, content: { 'application/json': { schema: schema(r.corps, 'input') } } };
    }
    if (r.authentifiee) operation.security = [{ session: [] }];
    doc.paths[r.chemin] = { ...doc.paths[r.chemin], [r.methode.toLowerCase()]: operation };
  }
  return doc;
}
