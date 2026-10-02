// Études (F-02), par TanStack Query. Chaque modification met l'étude en cache avec la réponse du
// serveur ; l'étude se relit toute seule tant que le worker calcule son adresse ou sa vignette.
import { type ParcelFeature, type Study, studyRoutes, type StudySummary } from '@contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { callApi } from '@/api/client';

export const STUDY_KEYS = {
  all: ['studies'] as const,
  list: (q: string, trash: boolean) => ['studies', 'list', q, trash] as const,
  one: (id: string) => ['studies', 'one', id] as const,
};

const POLL_MS = 1_000;

/** Mes études, ou ma corbeille ; relues tant qu'une vignette manque. */
export function useStudies(q: string, trash = false) {
  return useQuery({
    queryKey: STUDY_KEYS.list(q, trash),
    queryFn: () => callApi(studyRoutes.studies, { query: { q: q || undefined, trash: trash ? 'true' : undefined } }).then((r) => r.studies),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (!trash && query.state.data?.some((s) => s.thumbnailUrl === null) ? 2 * POLL_MS : false),
  });
}

export function useStudy(id: string | null) {
  return useQuery({
    queryKey: STUDY_KEYS.one(id ?? ''),
    queryFn: () => callApi(studyRoutes.study, { params: { id: id! } }),
    enabled: id !== null,
    retry: false,
    refetchInterval: (query) => (query.state.data && (query.state.data.addressPending || query.state.data.thumbnailPending) ? POLL_MS : false),
  });
}

function useSaved() {
  const client = useQueryClient();
  return (study: Study) => {
    client.setQueryData(STUDY_KEYS.one(study.id), study);
    void client.invalidateQueries({ queryKey: ['studies', 'list'] });
  };
}

export function useCreateStudy() {
  const saved = useSaved();
  return useMutation({
    mutationFn: (parcelIds: string[]) => callApi(studyRoutes.studyCreate, { body: { parcelIds } }),
    onSuccess: saved,
  });
}

export function useUpdateStudy(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (patch: { name?: string; addressId?: string }) => callApi(studyRoutes.studyUpdate, { params: { id }, body: patch }),
    onSuccess: saved,
  });
}

export function useDuplicateStudy() {
  const saved = useSaved();
  return useMutation({ mutationFn: (id: string) => callApi(studyRoutes.studyDuplicate, { params: { id } }), onSuccess: saved });
}

export function useTrashStudy() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callApi(studyRoutes.studyDelete, { params: { id } }),
    onSuccess: (_, id) => {
      void client.invalidateQueries({ queryKey: STUDY_KEYS.one(id) });
      void client.invalidateQueries({ queryKey: ['studies', 'list'] });
    },
  });
}

export function useRestoreStudy() {
  const saved = useSaved();
  return useMutation({ mutationFn: (id: string) => callApi(studyRoutes.studyRestore, { params: { id } }), onSuccess: saved });
}

const PARCEL_MUTATION = (id: string) => ['studies', 'parcels', id];

/**
 * Ajoute ou retire une parcelle, aussitôt affiché (mise à jour optimiste). Les clics rapides partent
 * en parallèle (le serveur les sérialise) ; l'étude est relue quand le dernier est revenu.
 */
export function useStudyParcel(id: string) {
  const client = useQueryClient();
  const key = STUDY_KEYS.one(id);
  return useMutation({
    mutationKey: PARCEL_MUTATION(id),
    mutationFn: ({ action, feature }: { action: 'add' | 'remove'; feature: ParcelFeature }) =>
      action === 'add'
        ? callApi(studyRoutes.studyParcelAdd, { params: { id, parcelId: feature.id } })
        : callApi(studyRoutes.studyParcelRemove, { params: { id, parcelId: feature.id } }),
    onMutate: async ({ action, feature }) => {
      await client.cancelQueries({ queryKey: key });
      // On ne clique que sur une étude affichée : elle est en cache.
      const before = client.getQueryData<Study>(key)!;
      const parcels =
        action === 'add'
          ? [...before.parcels, { ...feature.properties, id: feature.id, area: 0, version: '', geometry: feature.geometry }]
          : before.parcels.filter((p) => p.id !== feature.id);
      client.setQueryData<Study>(key, { ...before, parcels, parcelCount: parcels.length });
      return { before };
    },
    onError: (_error, _vars, context) => client.setQueryData(key, context!.before),
    onSettled: async () => {
      if (client.isMutating({ mutationKey: PARCEL_MUTATION(id) }) <= 1) {
        await client.invalidateQueries({ queryKey: key });
        void client.invalidateQueries({ queryKey: ['studies', 'list'] });
      }
    },
  });
}

export type { Study, StudySummary };
