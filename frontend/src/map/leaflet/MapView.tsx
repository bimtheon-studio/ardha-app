// La carte Leaflet (D-08) : fond IGN en tuiles, parcelles en vecteur (rendu canvas : des milliers de
// polygones sans ralentir), adresse choisie. Rendu seul : l'état vit dans la page. Couvert par l'e2e
// (jsdom ne dessine pas de carte).
import 'leaflet/dist/leaflet.css';

import type { Basemap, ParcelFeature } from '@contracts';
import type { Bbox } from '@domain';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';

import type { View } from '@/map/url-state';

export interface Viewport {
  bbox: Bbox;
  center: { lat: number; lon: number };
  zoom: number;
}

export interface Target {
  /** Change à chaque demande, même vers le même endroit. */
  key: number;
  view?: View;
  bounds?: Bbox;
}

interface Props {
  basemap: Basemap;
  muted: boolean;
  initialView: View;
  target: Target | null;
  marker: { lat: number; lon: number; label: string } | null;
  parcels: ParcelFeature[];
  showParcels: boolean;
  selected: ReadonlySet<string>;
  onViewport: (v: Viewport) => void;
  onParcelClick: (f: ParcelFeature) => void;
}

const STYLE = {
  default: { color: '#0033A8', weight: 1, opacity: 0.8, fillColor: '#0033A8', fillOpacity: 0.04 },
  hover: { color: '#0033A8', weight: 2.5, opacity: 1, fillColor: '#0033A8', fillOpacity: 0.12 },
  selected: { color: '#0033A8', weight: 2.5, opacity: 1, fillColor: '#0033A8', fillOpacity: 0.4 },
} satisfies Record<string, L.PathOptions>;

function viewportOf(map: L.Map): Viewport {
  const b = map.getBounds();
  const c = map.getCenter();
  return { bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], center: { lat: c.lat, lon: c.lng }, zoom: map.getZoom() };
}

function ViewportEvents({ onViewport }: { onViewport: (v: Viewport) => void }) {
  const map = useMapEvents({ moveend: () => onViewport(viewportOf(map)) });
  useEffect(() => onViewport(viewportOf(map)), [map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Move({ target }: { target: Target | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (target.bounds) {
      const [w, s, e, n] = target.bounds;
      map.flyToBounds([[s, w], [n, e]], { padding: [40, 40], maxZoom: 19, duration: 0.6 });
    } else if (target.view) {
      map.flyTo([target.view.lat, target.view.lon], target.view.zoom, { duration: 0.8 });
    }
  }, [map, target]);
  return null;
}

function ParcelsLayer({ parcels, selected, onClick }: { parcels: ParcelFeature[]; selected: ReadonlySet<string>; onClick: (f: ParcelFeature) => void }) {
  const map = useMap();
  const layer = useRef<L.GeoJSON | null>(null);
  const selectedRef = useRef(selected);
  const clickRef = useRef(onClick);
  useEffect(() => {
    selectedRef.current = selected;
    clickRef.current = onClick;
  });

  useEffect(() => {
    const styleOf = (id: string) => (selectedRef.current.has(id) ? STYLE.selected : STYLE.default);
    const geo = L.geoJSON(undefined, {
      style: (f) => styleOf(String(f?.id)),
      onEachFeature: (f: ParcelFeature, l) => {
        l.bindTooltip(`<strong>${f.properties.label}</strong>`, { sticky: true, direction: 'top', opacity: 0.95 });
        l.on({
          click: (e: L.LeafletMouseEvent) => {
            L.DomEvent.stop(e);
            clickRef.current(f);
          },
          mouseover: () => (l as L.Path).setStyle(selectedRef.current.has(f.id) ? STYLE.selected : STYLE.hover),
          mouseout: () => (l as L.Path).setStyle(styleOf(f.id)),
        });
      },
    });
    geo.addTo(map);
    layer.current = geo;
    return () => {
      geo.remove();
      layer.current = null;
    };
  }, [map]);

  useEffect(() => {
    const geo = layer.current!;
    geo.clearLayers();
    geo.addData({ type: 'FeatureCollection', features: parcels } as GeoJSON.FeatureCollection);
  }, [parcels]);

  useEffect(() => {
    layer.current!.eachLayer((l) => {
      const id = String((l as L.Layer & { feature?: ParcelFeature }).feature?.id);
      (l as L.Path).setStyle(selected.has(id) ? STYLE.selected : STYLE.default);
    });
  }, [selected, parcels]);

  return null;
}

export default function MapView({ basemap, muted, initialView, target, marker, parcels, showParcels, selected, onViewport, onParcelClick }: Props) {
  return (
    <MapContainer
      center={[initialView.lat, initialView.lon]}
      zoom={initialView.zoom}
      maxZoom={basemap.maxZoom}
      className={`h-full w-full ${muted ? 'map-muted' : ''}`}
      preferCanvas
      zoomControl
      attributionControl
    >
      <TileLayer key={basemap.id} url={basemap.url} attribution={basemap.attribution} maxZoom={basemap.maxZoom} maxNativeZoom={basemap.maxZoom} />
      <ViewportEvents onViewport={onViewport} />
      <Move target={target} />
      <ParcelsLayer parcels={showParcels ? parcels : []} selected={selected} onClick={onParcelClick} />
      {marker && (
        <CircleMarker center={[marker.lat, marker.lon]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#C1272D', fillOpacity: 1 }}>
          <Tooltip permanent direction="top" offset={[0, -8]}>
            {marker.label}
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
