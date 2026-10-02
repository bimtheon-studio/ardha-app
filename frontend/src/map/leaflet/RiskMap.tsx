// Carte des risques d'une étude (F-04) : le fond, les couches de risques choisies (tuiles WMS de
// Géorisques et du BRGM, Q8), les parcelles, les bornes incendie et les cavités alentour. Couverte par
// l'e2e (happy-dom ne dessine pas de carte).
import 'leaflet/dist/leaflet.css';

import type { Basemap, RiskLayer, StudyParcel } from '@contracts';
import { bboxOf, unionBbox } from '@domain';
import type L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, WMSTileLayer } from 'react-leaflet';

const PARCEL: L.PathOptions = { color: '#0033A8', weight: 2.5, opacity: 1, fillColor: '#0033A8', fillOpacity: 0.15 };

export interface MapPoint {
  id: string;
  point: [number, number];
  label: string;
}

interface Props {
  basemap: Basemap;
  layers: RiskLayer[];
  parcels: StudyParcel[];
  hydrants: MapPoint[];
  cavities: MapPoint[];
}

export default function RiskMap({ basemap, layers, parcels, hydrants, cavities }: Props) {
  // Cadrée sur les parcelles et la borne incendie la plus proche (la liste arrive triée par distance).
  const nearest = hydrants[0]?.point;
  const boxes = [...parcels.map((p) => bboxOf(p.geometry)), ...(nearest ? [[nearest[0], nearest[1], nearest[0], nearest[1]] as const] : [])];
  const [w, s, e, n] = unionBbox(boxes) ?? [2.2, 46.2, 2.6, 46.6];
  const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: parcels.map((p) => ({ type: 'Feature', id: p.id, geometry: p.geometry, properties: {} })) };
  return (
    <MapContainer
      bounds={[
        [s, w],
        [n, e],
      ]}
      key={`${w},${s},${e},${n}`}
      boundsOptions={{ padding: [48, 48], maxZoom: 18 }}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer url={basemap.url} attribution={basemap.attribution} maxZoom={basemap.maxZoom} />
      {layers.map((l) => (
        <WMSTileLayer key={l.id} url={l.url} params={{ layers: l.layers, format: 'image/png', transparent: true }} opacity={0.6} attribution={l.attribution} />
      ))}
      <GeoJSON key={parcels.map((p) => p.id).join(',')} data={data} style={PARCEL} interactive={false} />
      {cavities.map((c) => (
        <CircleMarker key={c.id} center={[c.point[1], c.point[0]]} radius={5} pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#7A4B1E', fillOpacity: 1 }}>
          <Tooltip>{c.label}</Tooltip>
        </CircleMarker>
      ))}
      {hydrants.map((h) => (
        <CircleMarker key={h.id} center={[h.point[1], h.point[0]]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#C1272D', fillOpacity: 1 }}>
          <Tooltip>{h.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
