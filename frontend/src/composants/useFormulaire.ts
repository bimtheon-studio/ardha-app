// Formulaire validé par un schéma du contrat : mêmes règles, mêmes messages que l'API. Les erreurs
// renvoyées par l'API (adresse déjà prise…) s'affichent au même endroit.
import { messagesParChamp } from '@contrats';
import { useState } from 'react';
import type { z } from 'zod';

import { ErreurAppel } from '@/api/client';

export function useFormulaire<S extends z.ZodType>(schema: S) {
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  /** Rend les données valides, ou `null` après avoir affiché les erreurs. */
  function valider(valeurs: z.input<S>): z.output<S> | null {
    setMessage(null);
    const r = schema.safeParse(valeurs);
    if (r.success) {
      setChamps({});
      return r.data;
    }
    setChamps(messagesParChamp(r.error));
    return null;
  }

  function afficherErreur(e: unknown): void {
    if (e instanceof ErreurAppel) {
      setChamps(e.champs);
      setMessage(Object.keys(e.champs).length > 0 && e.statut === 400 ? null : e.message);
    } else {
      setMessage('Une erreur inattendue est survenue.');
    }
  }

  return { champs, message, valider, afficherErreur };
}
