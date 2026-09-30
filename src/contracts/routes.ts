// Une route de l'API, décrite une fois : l'API s'y conforme, le front en tire un client typé, et le
// document OpenAPI en est dérivé.
import { z } from 'zod';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Route<TBody extends z.ZodType | undefined = z.ZodType | undefined, TResponse extends z.ZodType | undefined = z.ZodType | undefined> {
  method: Method;
  path: string;
  summary: string;
  body: TBody;
  response: TResponse;
  /** Code HTTP en cas de succès. */
  status: number;
  /** Faux pour les routes ouvertes sans session (connexion, inscription…). */
  authenticated: boolean;
}

export function route<C extends z.ZodType | undefined, R extends z.ZodType | undefined>(r: Route<C, R>): Route<C, R> {
  return r;
}

export type BodyOf<R extends Route> = R['body'] extends z.ZodType ? z.input<R['body']> : undefined;
export type ResponseOf<R extends Route> = R['response'] extends z.ZodType ? z.output<R['response']> : undefined;

/** Réponse d'erreur de l'API : un message pour l'utilisateur, et au besoin un message par champ. */
export const ApiError = z.object({
  message: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;

/** Premier message de chaque champ en erreur, pour l'afficher sous le champ. */
export function messagesByField(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const problem of error.issues) {
    const field = problem.path.map(String).join('.') || '_';
    fields[field] ??= problem.message;
  }
  return fields;
}
