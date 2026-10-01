// Une route de l'API, décrite une fois : l'API s'y conforme, le front en tire un client typé, et le
// document OpenAPI en est dérivé.
import { z } from 'zod';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type Schema = z.ZodType | undefined;
/** Paramètres de chemin ou de requête : un objet dont chaque champ est une chaîne à l'arrivée. */
type Parameters = z.ZodObject | undefined;

export interface Route<
  TBody extends Schema = Schema,
  TResponse extends Schema = Schema,
  TQuery extends Parameters = Parameters,
  TParams extends Parameters = Parameters,
> {
  method: Method;
  /** Chemin, avec ses paramètres en `:nom` (`/api/communes/:code`). */
  path: string;
  summary: string;
  body: TBody;
  response: TResponse;
  /** Paramètres de la chaîne de requête (`?bbox=…`). */
  query: TQuery;
  /** Paramètres du chemin, un champ par `:nom`. */
  params: TParams;
  /** Code HTTP en cas de succès. */
  status: number;
  /** Faux pour les routes ouvertes sans session (connexion, inscription…). */
  authenticated: boolean;
  /** Type de média d'une réponse qui n'est pas du JSON (`image/png`). */
  produces?: string;
}

/** Décrit une route ; `query` et `params` sont facultatifs à la déclaration. */
export function route<C extends Schema, R extends Schema, Q extends Parameters = undefined, P extends Parameters = undefined>(
  r: Omit<Route<C, R, Q, P>, 'query' | 'params'> & { query?: Q; params?: P },
): Route<C, R, Q, P> {
  return { ...r, query: r.query as Q, params: r.params as P };
}

type Input<S> = S extends z.ZodType ? z.input<S> : never;
type Output<S> = S extends z.ZodType ? z.output<S> : undefined;

export type BodyOf<R extends Route> = R['body'] extends z.ZodType ? z.input<R['body']> : undefined;
export type ResponseOf<R extends Route> = Output<R['response']>;
export type QueryOf<R extends Route> = Output<NonNullable<R['query']>>;
export type ParamsOf<R extends Route> = Output<NonNullable<R['params']>>;

/** Ce qu'un appelant fournit à une route : seulement les parties qu'elle attend. */
export type RequestOf<R extends Route> = (R['body'] extends z.ZodType ? { body: Input<R['body']> } : unknown) &
  (R['query'] extends z.ZodType ? { query: Input<R['query']> } : unknown) &
  (R['params'] extends z.ZodType ? { params: Input<R['params']> } : unknown);

/** Faux quand la route n'attend rien : l'appel se fait alors sans second argument. */
export type NeedsRequest<R extends Route> = R['body'] extends z.ZodType
  ? true
  : R['query'] extends z.ZodType
    ? true
    : R['params'] extends z.ZodType
      ? true
      : false;

/**
 * URL d'appel : paramètres de chemin substitués et encodés, chaîne de requête dans l'ordre des
 * champs fournis (les valeurs `undefined` sont omises).
 */
export function urlOf(r: Route, params: Record<string, unknown> = {}, query: Record<string, unknown> = {}): string {
  const path = r.path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || value === '') throw new Error(`Paramètre manquant : ${name}`);
    return encodeURIComponent(String(value));
  });
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) search.set(k, String(v));
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

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
