// Client de l'API, tiré des routes du contrat (`src/contracts`) : chemin, méthode, corps et réponse
// typés, réponse validée à l'arrivée.
import { ApiError, type NeedsRequest, type RequestOf, type ResponseOf, type Route, urlOf } from '@contracts';

export class CallError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'CallError';
  }
}

const OFFLINE = 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez.';

type Parts = { body?: unknown; query?: Record<string, unknown>; params?: Record<string, unknown> };

export async function callApi<R extends Route>(
  route: R,
  ...request: NeedsRequest<R> extends true ? [RequestOf<R>] : []
): Promise<ResponseOf<R>> {
  const { body, query, params } = (request[0] ?? {}) as Parts;
  const hasBody = body !== undefined;
  let response: Response;
  try {
    response = await fetch(urlOf(route, params, query), {
      method: route.method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(hasBody && { 'Content-Type': 'application/json' }) },
      ...(hasBody && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new CallError(0, OFFLINE);
  }
  if (!response.ok) {
    const error = ApiError.safeParse(await response.json().catch(() => null));
    throw new CallError(
      response.status,
      error.success ? error.data.message : 'La requête a échoué. Réessayez dans un instant.',
      error.success ? error.data.fields : undefined,
    );
  }
  if (!route.response || response.status === 204) return undefined as ResponseOf<R>;
  return route.response.parse(await response.json()) as ResponseOf<R>;
}
