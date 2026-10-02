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
const BRGM_WMS = 'https://mapsref.brgm.fr/wxs/georisques/risques';
const GEORISQUES_WMS = 'https://www.georisques.gouv.fr/services';
const GEORISQUES = '© <a href="https://www.georisques.gouv.fr/">Géorisques</a> (BRGM, MTE)';

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
  // Couches de risques (F-04, Q8) : tuiles WMS de Géorisques et du BRGM, chargées par le navigateur
  // comme les fonds, sans interrogation au clic (l'ancien popup injectait le HTML du service).
  riskLayers: [
    { id: 'ppr-flood', label: 'Zonage des PPR inondation', url: BRGM_WMS, layers: 'PPRN_ZONE_INOND', attribution: GEORISQUES },
    { id: 'tri-heights', label: 'Hauteurs d’eau, crue moyenne (TRI)', url: BRGM_WMS, layers: 'ISO_HT_01_02MOY,ISO_HT_02_02MOY,ISO_HT_03_02MOY', attribution: GEORISQUES },
    { id: 'clay', label: 'Retrait-gonflement des argiles', url: GEORISQUES_WMS, layers: 'ALEARG_REALISE', attribution: GEORISQUES },
    { id: 'cavities', label: 'Cavités souterraines', url: GEORISQUES_WMS, layers: 'CAVITE_LOCALISEE', attribution: GEORISQUES },
    { id: 'polluted', label: 'Secteurs d’information sur les sols', url: GEORISQUES_WMS, layers: 'SSP_CLASSIFICATION_SIS', attribution: GEORISQUES },
  ],
  parcelsMinZoom: PARCELS_MIN_ZOOM,
};
