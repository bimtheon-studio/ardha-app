// État de la carte dans l'URL (F-01, Q7) : `/map?at=lat,lon,zoom&parcels=IDU,IDU`. Une sélection se
// partage et survit au rechargement ; l'étude enregistrée (L2) prendra le relais.
import { isParcelId, SELECTION_MAX } from '@domain';

export interface View {
  lat: number;
  lon: number;
  zoom: number;
}

/** La France entière (F-01, #21). */
export const FRANCE: View = { lat: 46.6, lon: 1.89, zoom: 6 };

export function parseView(value: string | null): View | null {
  const parts = value?.split(',').map(Number);
  if (parts?.length !== 3 || !parts.every(Number.isFinite)) return null;
  const [lat, lon, zoom] = parts as [number, number, number];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || zoom < 0 || zoom > 22) return null;
  return { lat, lon, zoom: Math.round(zoom) };
}

export function formatView(v: View): string {
  return `${v.lat.toFixed(5)},${v.lon.toFixed(5)},${v.zoom}`;
}

/** Identifiants valides, sans doublon, au plus 50. */
export function parseParcelIds(value: string | null): string[] {
  const ids = (value ?? '').split(',').filter(isParcelId);
  return [...new Set(ids)].slice(0, SELECTION_MAX);
}
