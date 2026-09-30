// Client de l'API, tiré des routes du contrat (`src/contracts`) : chemin, méthode, corps et réponse
// typés, réponse validée à l'arrivée.
import { type CorpsDe, ErreurApi, type ReponseDe, type Route } from '@contracts';

export class ErreurAppel extends Error {
  constructor(
    readonly statut: number,
    message: string,
    readonly champs: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ErreurAppel';
  }
}

const HORS_LIGNE = 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez.';

export async function appeler<R extends Route>(route: R, ...corps: CorpsDe<R> extends undefined ? [] : [CorpsDe<R>]): Promise<ReponseDe<R>> {
  let reponse: Response;
  try {
    reponse = await fetch(route.chemin, {
      method: route.methode,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corps.length > 0 && { 'Content-Type': 'application/json' }) },
      ...(corps.length > 0 && { body: JSON.stringify(corps[0]) }),
    });
  } catch {
    throw new ErreurAppel(0, HORS_LIGNE);
  }
  if (!reponse.ok) {
    const erreur = ErreurApi.safeParse(await reponse.json().catch(() => null));
    throw new ErreurAppel(
      reponse.status,
      erreur.success ? erreur.data.message : 'La requête a échoué. Réessayez dans un instant.',
      erreur.success ? erreur.data.champs : undefined,
    );
  }
  if (!route.reponse || reponse.status === 204) return undefined as ReponseDe<R>;
  return route.reponse.parse(await reponse.json()) as ReponseDe<R>;
}
