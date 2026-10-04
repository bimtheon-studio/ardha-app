// Carte du marché d'une étude (F-05) : le fond, le cercle des comparables, les parcelles de l'étude,
// les ventes DVF en points colorés par prix au m² et, quand le cadastre est chargé, les parcelles
// vendues (Q10). Une vente choisie (dans la liste ou sur la carte) est mise en avant et centrée.
// Couverte par l'e2e (happy-dom ne dessine pas de carte).
import 'leaflet/dist/leaflet.css';

import type { Basemap, MarketSale, StudyParcel } from '@contracts';
import type L from 'leaflet';
import { useEffect } from 'react';
import { Circle, CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';

const PARCEL: L.PathOptions = { color: '#0033A8', weight: 2.5, opacity: 1, fillColor: '#0033A8', fillOpacity: 0.15 };
const CIRCLE: L.PathOptions = { color: '#0033A8', weight: 1.5, dashArray: '6 6', fill: false };
const UNPRICED = '#8A8F98';

interface Props {
  basemap: Basemap;
  parcels: StudyParcel[];
  center: [number, number];
  radiusM: number;
  sales: MarketSale[];
  color: (sale: MarketSale) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: (sale: MarketSale) => string;
}

/** Centre la carte sur la vente choisie. */
function Follow({ sale }: { sale: MarketSale | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (sale) map.flyTo([sale.position[1], sale.position[0]], Math.max(map.getZoom(), 17), { duration: 0.4 });
  }, [map, sale]);
  return null;
}

export default function MarketMap({ basemap, parcels, center, radiusM, sales, color, selectedId, onSelect, label }: Props) {
  const [lon, lat] = center;
  const dLat = radiusM / 111_320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const study: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: parcels.map((p) => ({ type: 'Feature', id: p.id, geometry: p.geometry, properties: {} })) };
  const sold: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: sales.flatMap((s) => s.parcels.map((p) => ({ type: 'Feature' as const, id: `${s.id}:${p.id}`, geometry: p.geometry as GeoJSON.Geometry, properties: { sale: s.id } }))),
  };
  const byId = new Map(sales.map((s) => [s.id, s]));
  const selected = selectedId ? byId.get(selectedId) : undefined;
  return (
    <MapContainer
      bounds={[
        [lat - dLat, lon - dLon],
        [lat + dLat, lon + dLon],
      ]}
      key={`${lon},${lat},${radiusM}`}
      boundsOptions={{ padding: [16, 16] }}
      scrollWheelZoom={false}
      preferCanvas
      className="h-full w-full"
    >
      <TileLayer url={basemap.url} attribution={basemap.attribution} maxZoom={basemap.maxZoom} />
      <Circle center={[lat, lon]} radius={radiusM} pathOptions={CIRCLE} interactive={false} />
      <GeoJSON
        key={`sold-${sales.length}-${sold.features.length}`}
        data={sold}
        style={(f) => {
          const sale = byId.get((f?.properties as { sale: string }).sale)!;
          return { color: sale.id === selectedId ? '#111' : color(sale), weight: sale.id === selectedId ? 3 : 1, fillColor: color(sale), fillOpacity: 0.45 };
        }}
        onEachFeature={(f, layer) => layer.on('click', () => onSelect((f.properties as { sale: string }).sale))}
      />
      <GeoJSON key={parcels.map((p) => p.id).join(',')} data={study} style={PARCEL} interactive={false} />
      {sales.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.position[1], s.position[0]]}
          radius={s.id === selectedId ? 8 : 5}
          pathOptions={{ color: s.id === selectedId ? '#111' : '#fff', weight: s.id === selectedId ? 2.5 : 1, fillColor: s.pricePerM2 ? color(s) : UNPRICED, fillOpacity: 0.95 }}
          eventHandlers={{ click: () => onSelect(s.id) }}
        >
          <Tooltip>{label(s)}</Tooltip>
        </CircleMarker>
      ))}
      <Follow sale={selected} />
    </MapContainer>
  );
}
