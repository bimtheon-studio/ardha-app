// Carte des risques d'une étude (F-04) : le fond, la couche de risques choisie (tuiles WMS de
// Géorisques et du BRGM, Q8), les parcelles, la zone des alentours, les bornes incendie et les cavités.
// Cadrée sur la zone des alentours (500 m) : les points listés y sont, et les hauteurs d'eau du TRI,
// que le BRGM ne sert qu'entre 1:5 000 et 1:30 000, s'y voient. Couverte par l'e2e (happy-dom ne
// dessine pas de carte).
import 'leaflet/dist/leaflet.css';

import type { Basemap, RiskLayer, StudyParcel } from '@contracts';
import { bboxOf, NEARBY_RADIUS_M, zoneAround } from '@domain';
import type L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, WMSTileLayer } from 'react-leaflet';

import { RISK_MAP_COLORS as C } from '@/map/risk-styles';

const PARCEL: L.PathOptions = { color: C.parcel, weight: 2.5, opacity: 1, fillColor: C.parcel, fillOpacity: 0.15 };
const ZONE: L.PathOptions = { color: C.zone, weight: 1.5, opacity: 0.9, dashArray: '6 6', fill: false };

export interface MapPoint {
  id: string;
  point: [number, number];
  label: string;
}

interface Props {
  basemap: Basemap;
  layer: RiskLayer | null;
  parcels: StudyParcel[];
  hydrants: MapPoint[];
  cavities: MapPoint[];
}

export default function RiskMap({ basemap, layer, parcels, hydrants, cavities }: Props) {
  const zone = zoneAround(
    parcels.map((p) => p.geometry),
    NEARBY_RADIUS_M,
  );
  const [w, s, e, n] = zone ? bboxOf(zone) : [2.2, 46.2, 2.6, 46.6];
  const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: parcels.map((p) => ({ type: 'Feature', id: p.id, geometry: p.geometry, properties: {} })) };
  return (
    <MapContainer
      bounds={[
        [s, w],
        [n, e],
      ]}
      key={`${w},${s},${e},${n}`}
      boundsOptions={{ padding: [8, 8] }}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer url={basemap.url} attribution={basemap.attribution} maxZoom={basemap.maxZoom} />
      {layer && <WMSTileLayer key={layer.id} url={layer.url} params={{ layers: layer.layers, format: 'image/png', transparent: true }} opacity={0.6} attribution={layer.attribution} />}
      {zone && <GeoJSON key={`zone-${w},${s},${e},${n}`} data={zone} style={ZONE} interactive={false} />}
      <GeoJSON key={parcels.map((p) => p.id).join(',')} data={data} style={PARCEL} interactive={false} />
      {cavities.map((c) => (
        <CircleMarker key={c.id} center={[c.point[1], c.point[0]]} radius={5} pathOptions={{ color: '#fff', weight: 1.5, fillColor: C.cavity, fillOpacity: 1 }}>
          <Tooltip>{c.label}</Tooltip>
        </CircleMarker>
      ))}
      {hydrants.map((h) => (
        <CircleMarker key={h.id} center={[h.point[1], h.point[0]]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: C.hydrant, fillOpacity: 1 }}>
          <Tooltip>{h.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
