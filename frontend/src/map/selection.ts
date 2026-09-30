// Sélection de parcelles côté front : identifiants dans l'URL, géométries tirées des parcelles déjà
// reçues (cases de la carte) ou demandées par identifiants au rechargement. Règles du domaine
// (contiguïté, plafond) appliquées au clic, sans aller-retour.
import type { ParcelFeature } from '@contracts';
import { type AddRefusal, REFUSAL_MESSAGES, type SelectableParcel, summarize, toggle } from '@domain';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useParcelsByIds } from './api';
import { parseParcelIds } from './url-state';

export type SelectedParcel = SelectableParcel & { feature: ParcelFeature };

const asSelectable = (f: ParcelFeature): SelectedParcel => ({ id: f.id, geometry: f.geometry, contenance: f.properties.contenance, feature: f });

export function useSelection(visible: readonly ParcelFeature[]) {
  const [params, setParams] = useSearchParams();
  const ids = useMemo(() => parseParcelIds(params.get('parcels')), [params]);
  // Parcelles sélectionnées déjà vues : elles restent connues quand la carte s'en éloigne.
  const [seen, setSeen] = useState<ReadonlyMap<string, ParcelFeature>>(new Map());
  const visibleById = useMemo(() => new Map(visible.map((f) => [f.id, f])), [visible]);
  // Ajustement pendant le rendu (et non dans un effet) : React refait le rendu aussitôt, sans état intermédiaire.
  const fresh = ids.filter((id) => visibleById.has(id) && seen.get(id) !== visibleById.get(id));
  if (fresh.length > 0) setSeen(new Map([...seen, ...fresh.map((id) => [id, visibleById.get(id)!] as const)]));
  const missing = useMemo(() => ids.filter((id) => !visibleById.has(id) && !seen.has(id)), [ids, visibleById, seen]);
  const fetched = useParcelsByIds(missing);
  const [refusal, setRefusal] = useState<{ reason: AddRefusal; at: number } | null>(null);

  const selection = useMemo(() => {
    const fromIds = new Map((fetched.data ?? []).map((f) => [f.id, f]));
    return ids.flatMap((id) => {
      const f = visibleById.get(id) ?? seen.get(id) ?? fromIds.get(id);
      return f ? [asSelectable(f)] : [];
    });
  }, [ids, visibleById, seen, fetched.data]);

  const write = useCallback(
    (next: readonly string[]) =>
      setParams(
        (p) => {
          const copy = new URLSearchParams(p);
          if (next.length > 0) copy.set('parcels', next.join(','));
          else copy.delete('parcels');
          return copy;
        },
        { replace: true },
      ),
    [setParams],
  );

  const click = useCallback(
    (f: ParcelFeature) => {
      setSeen((prev) => new Map(prev).set(f.id, f));
      const r = toggle(selection, asSelectable(f));
      if (r.action === 'refused') return setRefusal({ reason: r.refusal, at: Date.now() });
      setRefusal(null);
      write(r.selection.map((p) => p.id));
    },
    [selection, write],
  );

  return {
    ids,
    selection,
    /** Identifiants de l'URL dont on attend encore la géométrie (ou inconnus). */
    pending: missing.length > 0 && fetched.isFetching,
    unknown: fetched.isSuccess ? missing.filter((id) => !fetched.data.some((f) => f.id === id)) : [],
    summary: summarize(selection),
    refusal: refusal && REFUSAL_MESSAGES[refusal.reason],
    click,
    remove: (id: string) => write(ids.filter((i) => i !== id)),
    clear: () => write([]),
    dismissRefusal: () => setRefusal(null),
  };
}
