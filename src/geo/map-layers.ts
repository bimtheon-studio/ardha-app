// Fonds de carte : tuiles IGN chargées directement par le navigateur (D-08). Servis par l'API pour
// qu'un changement (proxy, autre fournisseur) ne soit qu'un changement d'URL (PLAN §9).
import type { MapLayers } from '../contracts/index.ts';

const WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const IGN = '© <a href="https://www.ign.fr/">IGN</a> – Géoplateforme';
const CADASTRE = 'Cadastre © DGFiP, Etalab';

/** Zoom à partir duquel le front affiche les parcelles (F-01, #7). */
export const PARCELS_MIN_ZOOM = 16;

export const MAP_LAYERS: MapLayers = {
  basemaps: [
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
  defaultBasemap: 'plan',
  parcelsMinZoom: PARCELS_MIN_ZOOM,
};
