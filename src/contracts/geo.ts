// Contrat de la carte et du parcellaire (F-01) : adresses, communes, parcelles, fonds de carte.
import { COMMUNE_CODE, isParcelId, parseBbox, SELECTION_MAX } from '../domain/index.ts';
import { z } from 'zod';

import { route } from './routes.ts';

const Position = z.array(z.number()).min(2);
const Ring = z.array(Position);

export const Surface = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(Ring) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(Ring)) }),
]);

const longitude = z.coerce.number('Longitude invalide.').min(-180, 'Longitude invalide.').max(180, 'Longitude invalide.');
const latitude = z.coerce.number('Latitude invalide.').min(-90, 'Latitude invalide.').max(90, 'Latitude invalide.');
const communeCode = z.string().regex(COMMUNE_CODE, 'Code commune invalide.');

export const Address = z.object({
  /** Identifiant BAN. */
  id: z.string(),
  label: z.string(),
  /** Sans code postal ni commune : « 2 Rue Étienne Dolet », « Rue Pasteur », « Les Fourches ». */
  name: z.string(),
  /** Voie, sans le numéro ; nulle pour un lieu-dit ou une commune. */
  street: z.string().nullable(),
  /** « 94, Val-de-Marne, Île-de-France ». */
  context: z.string(),
  kind: z.enum(['housenumber', 'street', 'locality', 'municipality']),
  lon: z.number(),
  lat: z.number(),
  communeCode: z.string(),
  city: z.string(),
  postcode: z.string().nullable(),
  score: z.number(),
});
export type Address = z.infer<typeof Address>;

export const AddressSearch = z.object({
  q: z.string('Saisissez une adresse.').trim().min(3, 'Saisissez au moins 3 caractères.').max(200, 'Adresse trop longue.'),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export const Point = z.object({ lon: longitude, lat: latitude });

export const SourceStatus = z.enum(['queued', 'loading', 'ready', 'failed']);
export type SourceStatus = z.infer<typeof SourceStatus>;

export const CadastreState = z.object({
  /** `missing` : jamais demandé. */
  status: z.union([SourceStatus, z.literal('missing')]),
  /** Millésime chargé (`2026-09-01`), gardé pendant un rechargement. */
  version: z.string().nullable(),
  loadedAt: z.iso.datetime().nullable(),
  parcelCount: z.number().int().nullable(),
  /** Message pour l'utilisateur quand le chargement a échoué. */
  error: z.string().nullable(),
});
export type CadastreState = z.infer<typeof CadastreState>;

export const Commune = z.object({
  code: z.string(),
  /** Nul tant que la commune n'est pas chargée. */
  name: z.string().nullable(),
  center: z.tuple([z.number(), z.number()]).nullable(),
  cadastre: CadastreState,
});
export type Commune = z.infer<typeof Commune>;

export const CommuneRef = z.object({ code: z.string(), name: z.string() });
export type CommuneRef = z.infer<typeof CommuneRef>;

export const ParcelProperties = z.object({
  communeCode: z.string(),
  prefix: z.string(),
  section: z.string(),
  number: z.string(),
  /** « AB 12 ». */
  label: z.string(),
  contenance: z.number().nullable(),
});

export const ParcelFeature = z.object({
  type: z.literal('Feature'),
  id: z.string(),
  geometry: Surface,
  properties: ParcelProperties,
});
export type ParcelFeature = z.infer<typeof ParcelFeature>;

export const Parcels = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(ParcelFeature),
  /** Vrai quand le plafond a coupé la réponse. */
  truncated: z.boolean(),
});
export type Parcels = z.infer<typeof Parcels>;

export const ParcelsQuery = z
  .object({
    bbox: z
      .string()
      .refine((t) => parseBbox(t) !== null, 'Emprise invalide : ouest,sud,est,nord en degrés.')
      .optional(),
    ids: z
      .string()
      .refine((t) => t.split(',').every(isParcelId), 'Identifiant de parcelle invalide.')
      .refine((t) => t.split(',').length <= SELECTION_MAX, `Au plus ${SELECTION_MAX} parcelles.`)
      .optional(),
  })
  .refine((q) => (q.bbox === undefined) !== (q.ids === undefined), 'Indiquez une emprise (bbox) ou des identifiants (ids).');

export const Basemap = z.object({
  id: z.string(),
  label: z.string(),
  /** Modèle d'URL de tuiles `{z}/{x}/{y}`. */
  url: z.string(),
  attribution: z.string(),
  maxZoom: z.number().int(),
});
export type Basemap = z.infer<typeof Basemap>;

/** Couche de risques en WMS, affichée par-dessus le fond (F-04, Q8). */
export const RiskLayer = z.object({
  id: z.string(),
  label: z.string(),
  /** Adresse du service WMS. */
  url: z.string(),
  /** Couches WMS, séparées par des virgules. */
  layers: z.string(),
  attribution: z.string(),
});
export type RiskLayer = z.infer<typeof RiskLayer>;

export const MapLayers = z.object({ basemaps: z.array(Basemap), defaultBasemap: z.string(), parcelsMinZoom: z.number().int(), riskLayers: z.array(RiskLayer) });
export type MapLayers = z.infer<typeof MapLayers>;

const ElevationStats = z.object({ min: z.number(), max: z.number(), mean: z.number(), range: z.number(), points: z.number().int() });

/** Altitudes d'une sélection de parcelles (F-04, Q6) : par parcelle et en tout, m NGF. */
export const SelectionElevation = z.object({
  overall: ElevationStats.nullable(),
  parcels: z.array(z.object({ id: z.string(), stats: ElevationStats.nullable() })),
  source: z.string(),
});
export type SelectionElevation = z.infer<typeof SelectionElevation>;

export const geoRoutes = {
  addressSearch: route({
    method: 'GET',
    path: '/api/addresses/search',
    summary: 'Suggestions d’adresses (BAN, par le worker)',
    body: undefined,
    query: AddressSearch,
    response: z.object({ addresses: z.array(Address) }),
    status: 200,
    authenticated: true,
  }),
  addressReverse: route({
    method: 'GET',
    path: '/api/addresses/reverse',
    summary: 'Adresse la plus proche d’un point (BAN, par le worker)',
    body: undefined,
    query: Point,
    response: z.object({ address: Address.nullable() }),
    status: 200,
    authenticated: true,
  }),
  communeLocate: route({
    method: 'GET',
    path: '/api/communes/locate',
    summary: 'Commune d’un point',
    body: undefined,
    query: Point,
    response: z.object({ commune: CommuneRef.nullable() }),
    status: 200,
    authenticated: true,
  }),
  commune: route({
    method: 'GET',
    path: '/api/communes/:code',
    summary: 'Une commune et l’état de son cadastre',
    body: undefined,
    params: z.object({ code: communeCode }),
    response: Commune,
    status: 200,
    authenticated: true,
  }),
  communeCadastreLoad: route({
    method: 'POST',
    path: '/api/communes/:code/cadastre',
    summary: 'Demande le chargement du cadastre d’une commune (sans effet s’il est prêt ou en cours)',
    body: undefined,
    params: z.object({ code: communeCode }),
    response: Commune,
    status: 202,
    authenticated: true,
  }),
  parcels: route({
    method: 'GET',
    path: '/api/parcels',
    summary: 'Parcelles d’une emprise (bbox) ou par identifiants (ids)',
    body: undefined,
    query: ParcelsQuery,
    response: Parcels,
    status: 200,
    authenticated: true,
  }),
  parcelsElevation: route({
    method: 'GET',
    path: '/api/parcels/elevation',
    summary: 'Altitudes de parcelles (IGN, par le worker) : min, max, moyenne, dénivelé',
    body: undefined,
    query: z.object({
      ids: z
        .string()
        .refine((t) => t.split(',').every(isParcelId), 'Identifiant de parcelle invalide.')
        .refine((t) => t.split(',').length <= SELECTION_MAX, `Au plus ${SELECTION_MAX} parcelles.`),
    }),
    response: SelectionElevation,
    status: 200,
    authenticated: true,
  }),
  mapLayers: route({
    method: 'GET',
    path: '/api/map/layers',
    summary: 'Fonds de carte et réglages de la carte',
    body: undefined,
    response: MapLayers,
    status: 200,
    authenticated: true,
  }),
};
