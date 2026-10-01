// Données de la carte (F-01), par TanStack Query : fonds, adresses, commune et son cadastre,
// parcelles par case de grille (chaque case se met en cache et resert en revenant sur ses pas).
import { type Address, type Commune, geoRoutes, type ParcelFeature } from '@contracts';
import { type Bbox, formatBbox } from '@domain';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { callApi } from '@/api/client';

export const MAP_KEYS = {
  layers: ['map', 'layers'] as const,
  search: (q: string) => ['map', 'address-search', q] as const,
  locate: (lon: number, lat: number) => ['map', 'locate', lon, lat] as const,
  commune: (code: string) => ['map', 'commune', code] as const,
  cell: (cell: Bbox) => ['map', 'parcels', 'cell', formatBbox(cell)] as const,
  ids: (ids: readonly string[]) => ['map', 'parcels', 'ids', ids.join(',')] as const,
};

export function useMapLayers() {
  return useQuery({ queryKey: MAP_KEYS.layers, queryFn: () => callApi(geoRoutes.mapLayers), staleTime: Infinity });
}

/** Suggestions pour une saisie d'au moins 3 caractères ; la saisie précédente reste affichée pendant la suivante. */
export function useAddressSearch(q: string) {
  const query = q.trim();
  return useQuery<Address[]>({
    queryKey: MAP_KEYS.search(query),
    queryFn: ({ signal }) => callApi(geoRoutes.addressSearch, { query: { q: query } }, signal).then((r) => r.addresses),
    enabled: query.length >= 3,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function reverseGeocode(lon: number, lat: number) {
  return callApi(geoRoutes.addressReverse, { query: { lon, lat } }).then((r) => r.address);
}

/** Commune d'un point, arrondi à 0,01° (une case) : un déplacement dans la case ne redemande rien. */
export function useLocate(point: { lon: number; lat: number } | null) {
  const lon = point ? Math.round(point.lon * 100) / 100 : 0;
  const lat = point ? Math.round(point.lat * 100) / 100 : 0;
  return useQuery({
    queryKey: MAP_KEYS.locate(lon, lat),
    queryFn: () => callApi(geoRoutes.communeLocate, { query: { lon: point!.lon, lat: point!.lat } }).then((r) => r.commune),
    enabled: point !== null,
    staleTime: Infinity,
    retry: 1,
  });
}

const inProgress = (c: Commune | undefined) => c?.cadastre.status === 'queued' || c?.cadastre.status === 'loading';

/** État d'une commune, relu toutes les 2 s tant que son cadastre se charge. */
export function useCommune(code: string | null) {
  return useQuery({
    queryKey: MAP_KEYS.commune(code ?? ''),
    queryFn: () => callApi(geoRoutes.commune, { params: { code: code! } }),
    enabled: code !== null,
    refetchInterval: (q) => (inProgress(q.state.data) ? 2_000 : false),
  });
}

export function useLoadCadastre() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => callApi(geoRoutes.communeCadastreLoad, { params: { code } }),
    onSuccess: (c) => client.setQueryData(MAP_KEYS.commune(c.code), c),
  });
}

/** Parcelles des cases visibles, dédoublonnées (une parcelle à cheval sur deux cases arrive deux fois). */
export function useParcelsInCells(cells: readonly Bbox[]) {
  const results = useQueries({
    queries: cells.map((cell) => ({
      queryKey: MAP_KEYS.cell(cell),
      queryFn: () => callApi(geoRoutes.parcels, { query: { bbox: formatBbox(cell) } }),
      staleTime: 10 * 60_000,
    })),
  });
  const byId = new Map<string, ParcelFeature>();
  for (const r of results) for (const f of r.data?.features ?? []) byId.set(f.id, f);
  return {
    features: [...byId.values()],
    failed: results.some((r) => r.isError),
    truncated: results.some((r) => r.data?.truncated),
  };
}

export function useParcelsByIds(ids: readonly string[]) {
  return useQuery({
    queryKey: MAP_KEYS.ids(ids),
    queryFn: () => callApi(geoRoutes.parcels, { query: { ids: ids.join(',') } }).then((r) => r.features),
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
  });
}

/** Altitudes de la sélection (F-04, Q6), une fois la sélection stable : mesurées par le worker, en cache. */
export function useSelectionElevation(ids: readonly string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['map', 'elevation', key],
    queryFn: () => callApi(geoRoutes.parcelsElevation, { query: { ids: key } }),
    enabled: ids.length > 0,
    staleTime: 60 * 60_000,
    retry: false,
  });
}
