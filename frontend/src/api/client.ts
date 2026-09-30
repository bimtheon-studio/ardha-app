// Client de l'API, tiré des routes du contrat (`src/contracts`) : chemin, méthode, corps et réponse
// typés, réponse validée à l'arrivée.
import { type BodyOf, ApiError, type ResponseOf, type Route } from '@contracts';

export class CallError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ErreurAppel';
  }
}

const OFFLINE = 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez.';

export async function callApi<R extends Route>(route: R, ...body: BodyOf<R> extends undefined ? [] : [BodyOf<R>]): Promise<ResponseOf<R>> {
  let response: Response;
  try {
    response = await fetch(route.path, {
      method: route.method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body.length > 0 && { 'Content-Type': 'application/json' }) },
      ...(body.length > 0 && { body: JSON.stringify(body[0]) }),
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
