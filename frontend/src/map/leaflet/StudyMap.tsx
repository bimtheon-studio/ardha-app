// Carte en lecture de la page d'une étude (F-02, Q7) : le fond par défaut et les parcelles de
// l'étude, cadrée sur leur emprise. Couverte par l'e2e (happy-dom ne dessine pas de carte).
import 'leaflet/dist/leaflet.css';

import type { Basemap, StudyParcel } from '@contracts';
import { bboxOf, unionBbox } from '@domain';
import type L from 'leaflet';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';

const STYLE: L.PathOptions = { color: '#0033A8', weight: 2.5, opacity: 1, fillColor: '#0033A8', fillOpacity: 0.3 };

export default function StudyMap({ basemap, parcels }: { basemap: Basemap; parcels: StudyParcel[] }) {
  const [w, s, e, n] = unionBbox(parcels.map((p) => bboxOf(p.geometry))) ?? [2.2, 46.2, 2.6, 46.6];
  const data: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: parcels.map((p) => ({ type: 'Feature', id: p.id, geometry: p.geometry, properties: {} })),
  };
  return (
    <MapContainer
      bounds={[
        [s, w],
        [n, e],
      ]}
      boundsOptions={{ padding: [24, 24], maxZoom: 19 }}
      scrollWheelZoom={false}
      className="h-full w-full"
      aria-label="Carte des parcelles de l’étude"
    >
      <TileLayer url={basemap.url} attribution={basemap.attribution} maxZoom={basemap.maxZoom} />
      <GeoJSON key={parcels.map((p) => p.id).join(',')} data={data} style={STYLE} interactive={false} />
    </MapContainer>
  );
}
