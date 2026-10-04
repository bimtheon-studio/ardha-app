// Analyse de marché d'une étude (F-05), par TanStack Query : relue tant que le worker calcule ; les
// ventes du cercle se relisent quand le rayon ou les filtres changent.
import { type MarketResult, marketRoutes, type StudyMarket } from '@contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { callApi } from '@/api/client';

import { STUDY_KEYS } from './api';

export const marketKey = (id: string) => ['studies', 'market', id] as const;
export const salesKey = (id: string) => ['studies', 'market-sales', id] as const;

const running = (r: StudyMarket | undefined) => r?.status === 'queued' || r?.status === 'running';

export function useStudyMarket(id: string) {
  return useQuery({
    queryKey: marketKey(id),
    queryFn: () => callApi(marketRoutes.studyMarket, { params: { id } }),
    retry: false,
    refetchInterval: (q) => (running(q.state.data) ? 1_000 : false),
  });
}

export function useRequestMarket(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { force?: boolean; radiusM?: MarketResult['radiusM'] }) => callApi(marketRoutes.studyMarketRequest, { params: { id }, body: { force: body.force ?? false, ...(body.radiusM && { radiusM: body.radiusM }) } }),
    onSuccess: (r) => {
      client.setQueryData(marketKey(id), r);
      // Le rayon change les ventes du cercle ; l'étape Foncier change d'état quand l'analyse aboutit.
      void client.invalidateQueries({ queryKey: salesKey(id) });
      void client.invalidateQueries({ queryKey: STUDY_KEYS.one(id) });
    },
  });
}

export interface SalesFilters {
  type: 'all' | 'house' | 'apartment' | 'land' | 'commercial' | 'outbuilding' | 'other';
  segment: 'all' | 'existing' | 'new';
  from?: number;
}

/** `computedAt` : les ventes se relisent quand une analyse aboutit (la première charge les ventes DVF en base). */
export function useMarketSales(id: string, radiusM: number, computedAt: string | null, filters: SalesFilters) {
  return useQuery({
    queryKey: [...salesKey(id), radiusM, computedAt, filters],
    queryFn: () => callApi(marketRoutes.studyMarketSales, { params: { id }, query: { type: filters.type, segment: filters.segment, ...(filters.from && { from: filters.from }) } }),
    retry: false,
    placeholderData: keepPreviousData,
  });
}
