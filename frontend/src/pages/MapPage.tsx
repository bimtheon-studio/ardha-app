// Carte et parcellaire (F-01) : chercher une adresse, voir le cadastre, sélectionner des parcelles
// contiguës. Le panneau est à gauche sur ordinateur, sous la carte sur mobile (Q10).
import type { Address } from '@contracts';
import { type Bbox, bboxOf, gridCells, unionBbox } from '@domain';
import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Loading } from '@/components/Loading';
import { AddressSearch } from '@/map/AddressSearch';
import { useCommune, useLoadCadastre, useLocate, useMapLayers, useParcelsInCells } from '@/map/api';
import { BasemapSwitch } from '@/map/BasemapSwitch';
import { CommuneStatus } from '@/map/CommuneStatus';
import type { Target, Viewport } from '@/map/leaflet/MapView';
import { SelectionPanel } from '@/map/SelectionPanel';
import { useSelection } from '@/map/selection';
import { FRANCE, formatView, parseView } from '@/map/url-state';

const MapView = lazy(() => import('@/map/leaflet/MapView'));

/** Au-delà, la vue couvre trop de cases : on ne charge pas les parcelles (écran très large, dézoom). */
const MAX_CELLS = 16;
const MUTED_KEY = 'ardha.map.muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function MapPage() {
  const layers = useMapLayers();
  const [params, setParams] = useSearchParams();
  const [initialView] = useState(() => parseView(params.get('at')) ?? FRANCE);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [basemapId, setBasemapId] = useState<string | null>(null);
  const [muted, setMuted] = useState(readMuted);
  const client = useQueryClient();

  const minZoom = layers.data?.parcelsMinZoom ?? 16;
  const closeEnough = viewport !== null && viewport.zoom >= minZoom;
  const cells = useMemo<Bbox[]>(() => {
    if (!closeEnough) return [];
    const c = gridCells(viewport.bbox);
    return c.length <= MAX_CELLS ? c : [];
  }, [closeEnough, viewport]);

  const parcels = useParcelsInCells(cells);
  const sel = useSelection(parcels.features);
  const selectedIds = useMemo(() => new Set(sel.ids), [sel.ids]);

  // La commune au centre de la vue ; son cadastre se charge de lui-même s'il manque (Q3).
  const located = useLocate(closeEnough ? viewport.center : null);
  const communeCode = closeEnough ? (located.data?.code ?? null) : null;
  const commune = useCommune(communeCode);
  const load = useLoadCadastre();
  const requested = useRef(new Set<string>());
  useEffect(() => {
    const c = commune.data;
    if (c?.cadastre.status === 'missing' && !requested.current.has(c.code)) {
      requested.current.add(c.code);
      load.mutate(c.code);
    }
  }, [commune.data, load]);

  // Cadastre tout juste prêt : les cases déjà demandées (vides) se relisent.
  const status = commune.data?.cadastre.status;
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current && previous.current !== 'ready' && status === 'ready') {
      void client.invalidateQueries({ queryKey: ['map', 'parcels', 'cell'] });
    }
    previous.current = status;
  }, [status, client]);

  const onViewport = useCallback(
    (v: Viewport) => {
      setViewport(v);
      setParams(
        (p) => {
          const copy = new URLSearchParams(p);
          copy.set('at', formatView({ lat: v.center.lat, lon: v.center.lon, zoom: v.zoom }));
          return copy;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  function chooseAddress(a: Address) {
    setAddress(a);
    setTarget({ key: Date.now(), view: { lat: a.lat, lon: a.lon, zoom: a.kind === 'municipality' ? 15 : 18 } });
    if (!requested.current.has(a.communeCode)) {
      requested.current.add(a.communeCode);
      load.mutate(a.communeCode);
    }
  }

  function recenter() {
    const bounds = unionBbox(sel.selection.map((p) => bboxOf(p.geometry)));
    if (bounds) setTarget({ key: Date.now(), bounds });
  }

  function chooseMuted(m: boolean) {
    setMuted(m);
    try {
      localStorage.setItem(MUTED_KEY, m ? '1' : '0');
    } catch {
      // Préférence de confort : sans stockage, elle ne dure que la visite.
    }
  }

  const communeNames = useMemo(() => {
    const names = new Map<string, string>();
    if (commune.data?.name) names.set(commune.data.code, commune.data.name);
    if (address) names.set(address.communeCode, address.city);
    return names;
  }, [commune.data, address]);

  if (!layers.data) return <Loading />;
  const basemap = layers.data.basemaps.find((b) => b.id === (basemapId ?? layers.data.defaultBasemap)) ?? layers.data.basemaps[0]!;

  let hint: string | null = null;
  if (!viewport || viewport.zoom < minZoom) hint = 'Recherchez une adresse, ou zoomez pour afficher les parcelles.';
  else if (cells.length === 0) hint = 'Zone trop étendue : zoomez pour afficher les parcelles.';
  else if (parcels.failed) hint = 'Les parcelles n’ont pas pu être chargées.';
  else if (parcels.truncated) hint = 'Trop de parcelles ici : toutes ne sont pas affichées, zoomez.';

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:flex-row">
      <aside className="order-2 max-h-[45dvh] space-y-6 overflow-y-auto border-t bg-card p-4 md:order-1 md:max-h-none md:w-[360px] md:shrink-0 md:border-t-0 md:border-r">
        <div className="space-y-1">
          <p className="eyebrow text-primary">Carte et parcellaire</p>
          <h1 className="text-xl">Choisir des parcelles</h1>
        </div>
        <AddressSearch onChoose={chooseAddress} />
        <CommuneStatus
          commune={commune.data}
          loading={closeEnough && (located.isFetching || commune.isFetching) && !commune.data}
          onRetry={() => communeCode && load.mutate(communeCode)}
        />
        <SelectionPanel
          selection={sel.selection}
          summary={sel.summary}
          pending={sel.pending}
          unknown={sel.unknown}
          refusal={sel.refusal}
          communeNames={communeNames}
          onRemove={sel.remove}
          onClear={sel.clear}
          onRecenter={recenter}
          onDismissRefusal={sel.dismissRefusal}
        />
        <BasemapSwitch basemaps={layers.data.basemaps} value={basemap.id} muted={muted} onChange={setBasemapId} onMutedChange={chooseMuted} />
      </aside>
      <div className="relative order-1 min-h-[55dvh] flex-1 md:order-2">
        <Suspense fallback={<Loading />}>
          <MapView
            basemap={basemap}
            muted={muted}
            initialView={initialView}
            target={target}
            marker={address && { lat: address.lat, lon: address.lon, label: address.label }}
            parcels={parcels.features}
            showParcels={closeEnough}
            selected={selectedIds}
            onViewport={onViewport}
            onParcelClick={sel.click}
          />
        </Suspense>
        {hint && (
          <p role="status" className="pointer-events-none absolute top-3 left-1/2 z-[500] -translate-x-1/2 border bg-card/95 px-3 py-1.5 text-sm shadow-sm">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
