// Fonds de carte, chargés directement par le navigateur : OpenStreetMap par défaut, comme dans
// l'ancienne application, et les fonds IGN (D-08) au choix (F-01, Q8, arbitré le 01/10/2026). Servis par l'API pour qu'un
// changement (proxy, autre fournisseur) ne soit qu'un changement d'URL (PLAN §9).
//
// Les tuiles d'OpenStreetMap ont une politique d'usage (pas d'usage intensif sans accord) : à
// surveiller avec la mesure des erreurs de tuiles, et à servir par un proxy ou un fournisseur si
// le trafic grossit.
import type { MapLayers } from '../contracts/index.ts';

const WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const IGN = '© <a href="https://www.ign.fr/">IGN</a> – Géoplateforme';
const CADASTRE = 'Cadastre © DGFiP, Etalab';

/** Zoom à partir duquel le front affiche les parcelles (F-01, #7). */
export const PARCELS_MIN_ZOOM = 16;

export const MAP_LAYERS: MapLayers = {
  basemaps: [
    {
      id: 'osm',
      label: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">contributeurs d’OpenStreetMap</a> · ' + CADASTRE,
      maxZoom: 19,
    },
    {
      id: 'plan',
      label: 'Plan IGN',
      url: `${WMTS}&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png`,
      attribution: `${IGN} · ${CADASTRE}`,
      maxZoom: 19,
    },
    {
      id: 'ortho',
      label: 'Photographies aériennes',
      url: `${WMTS}&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg`,
      attribution: `${IGN} · ${CADASTRE}`,
      maxZoom: 20,
    },
  ],
  defaultBasemap: 'osm',
  parcelsMinZoom: PARCELS_MIN_ZOOM,
};
