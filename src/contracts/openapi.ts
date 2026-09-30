// Document OpenAPI 3.1, dérivé des routes décrites dans ce paquet.
import { z } from 'zod';

import { ApiError, type Route } from './routes.ts';

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
  for (const [name, r] of Object.entries(routes)) {
    const operation: Record<string, unknown> = {
      operationId: name,
      summary: r.summary,
      responses: {
        [r.status]: r.response
          ? { description: 'Succès', content: { 'application/json': { schema: schema(r.response, 'output') } } }
          : { description: 'Succès, sans contenu' },
        default: { description: 'Erreur', content: { 'application/json': { schema: schema(ApiError, 'output') } } },
      },
    };
    if (r.body) {
      operation.requestBody = { required: true, content: { 'application/json': { schema: schema(r.body, 'input') } } };
    }
    if (r.authenticated) operation.security = [{ session: [] }];
    doc.paths[r.path] = { ...doc.paths[r.path], [r.method.toLowerCase()]: operation };
  }
  return doc;
}
