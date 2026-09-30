// Formulaire validé par un schéma du contrat : mêmes règles, mêmes messages que l'API. Les erreurs
// renvoyées par l'API (adresse déjà prise…) s'affichent au même endroit.
import { messagesByField } from '@contracts';
import { useState } from 'react';
import type { z } from 'zod';

import { CallError } from '@/api/client';

export function useForm<S extends z.ZodType>(schema: S) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  /** Rend les données valides, ou `null` après avoir affiché les erreurs. */
  function validate(values: z.input<S>): z.output<S> | null {
    setMessage(null);
    const r = schema.safeParse(values);
    if (r.success) {
      setFields({});
      return r.data;
    }
    setFields(messagesByField(r.error));
    return null;
  }

  function showError(e: unknown): void {
    if (e instanceof CallError) {
      setFields(e.fields);
      setMessage(Object.keys(e.fields).length > 0 && e.status === 400 ? null : e.message);
    } else {
      setMessage('Une erreur inattendue est survenue.');
    }
  }

  return { fields, message, validate, showError };
}
