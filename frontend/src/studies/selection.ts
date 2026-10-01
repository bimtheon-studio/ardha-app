// Sélection de la carte d'une étude (F-02, Q8) : les parcelles de l'étude, et chaque clic
// s'enregistre aussitôt. Même forme que la sélection de `/map` (`useSelection`), pour le même écran.
import type { ParcelFeature, StudyParcel } from '@contracts';
import { REFUSAL_MESSAGES, summarize, toggle } from '@domain';
import { useCallback, useMemo, useState } from 'react';

import type { SelectedParcel } from '@/map/selection';

import { useStudy, useStudyParcel } from './api';

export const LAST_PARCEL = 'Une étude garde au moins une parcelle.';

export function toFeature(p: StudyParcel): ParcelFeature {
  return {
    type: 'Feature',
    id: p.id,
    geometry: p.geometry,
    properties: { communeCode: p.communeCode, prefix: p.prefix, section: p.section, number: p.number, label: p.label, contenance: p.contenance },
  };
}

const asSelected = (f: ParcelFeature): SelectedParcel => ({ id: f.id, geometry: f.geometry, contenance: f.properties.contenance, feature: f });

export function useStudySelection(id: string | null) {
  const study = useStudy(id);
  const parcel = useStudyParcel(id ?? '');
  const [refusal, setRefusal] = useState<string | null>(null);
  const selection = useMemo(() => (study.data?.parcels ?? []).map((p) => asSelected(toFeature(p))), [study.data]);

  const change = useCallback(
    (f: ParcelFeature, action: 'add' | 'remove') => {
      if (action === 'remove' && selection.length === 1) return setRefusal(LAST_PARCEL);
      setRefusal(null);
      parcel.mutate({ action, feature: f }, { onError: (e) => setRefusal(e.message) });
    },
    [parcel, selection.length],
  );

  const click = useCallback(
    (f: ParcelFeature) => {
      const r = toggle(selection, asSelected(f));
      if (r.action === 'refused') return setRefusal(REFUSAL_MESSAGES[r.refusal]);
      change(f, r.action === 'added' ? 'add' : 'remove');
    },
    [selection, change],
  );

  return {
    study,
    ids: selection.map((p) => p.id),
    selection,
    pending: study.isPending,
    unknown: [] as string[],
    summary: summarize(selection),
    refusal,
    saving: parcel.isPending,
    click,
    /** Bouton « Retirer » de la liste : la parcelle y est forcément. */
    remove: (parcelId: string) => change(selection.find((s) => s.id === parcelId)!.feature, 'remove'),
    dismissRefusal: () => setRefusal(null),
  };
}
