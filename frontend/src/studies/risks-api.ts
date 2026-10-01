// Analyse des risques d'une étude (F-04), par TanStack Query : relue tant que le worker calcule.
import { riskRoutes, type StudyRisks } from '@contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { callApi } from '@/api/client';

import { STUDY_KEYS } from './api';

export const riskKey = (id: string) => ['studies', 'risks', id] as const;

const running = (r: StudyRisks | undefined) => r?.status === 'queued' || r?.status === 'running';

export function useStudyRisks(id: string) {
  return useQuery({
    queryKey: riskKey(id),
    queryFn: () => callApi(riskRoutes.studyRisks, { params: { id } }),
    retry: false,
    refetchInterval: (q) => (running(q.state.data) ? 1_000 : false),
  });
}

export function useRequestRisks(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => callApi(riskRoutes.studyRisksRequest, { params: { id }, body: { force } }),
    onSuccess: (r) => {
      client.setQueryData(riskKey(id), r);
      // L'étape Risques de l'étude change d'état quand l'analyse aboutit.
      void client.invalidateQueries({ queryKey: STUDY_KEYS.one(id) });
    },
  });
}
