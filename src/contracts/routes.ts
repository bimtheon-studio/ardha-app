// Une route de l'API, décrite une fois : l'API s'y conforme, le front en tire un client typé, et le
// document OpenAPI en est dérivé.
import { z } from 'zod';

export type Methode = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Route<Corps extends z.ZodType | undefined = z.ZodType | undefined, Reponse extends z.ZodType | undefined = z.ZodType | undefined> {
  methode: Methode;
  chemin: string;
  resume: string;
  corps: Corps;
  reponse: Reponse;
  /** Code HTTP en cas de succès. */
  statut: number;
  /** Faux pour les routes ouvertes sans session (connexion, inscription…). */
  authentifiee: boolean;
}

export function route<C extends z.ZodType | undefined, R extends z.ZodType | undefined>(r: Route<C, R>): Route<C, R> {
  return r;
}

export type CorpsDe<R extends Route> = R['corps'] extends z.ZodType ? z.input<R['corps']> : undefined;
export type ReponseDe<R extends Route> = R['reponse'] extends z.ZodType ? z.output<R['reponse']> : undefined;

/** Réponse d'erreur de l'API : un message pour l'utilisateur, et au besoin un message par champ. */
export const ErreurApi = z.object({
  message: z.string(),
  champs: z.record(z.string(), z.string()).optional(),
});
export type ErreurApi = z.infer<typeof ErreurApi>;

/** Premier message de chaque champ en erreur, pour l'afficher sous le champ. */
export function messagesParChamp(erreur: z.ZodError): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const probleme of erreur.issues) {
    const champ = probleme.path.map(String).join('.') || '_';
    champs[champ] ??= probleme.message;
  }
  return champs;
}
