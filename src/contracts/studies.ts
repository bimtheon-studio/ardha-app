// Contrat de l'étude (F-02) : créer depuis une sélection, lister, rouvrir, renommer, choisir
// l'adresse, modifier les parcelles, dupliquer, corbeille.
import { isParcelId, SELECTION_MAX, STUDY_NAME_MAX } from '../domain/index.ts';
import { z } from 'zod';

import { Address, Surface } from './geo.ts';
import { route } from './routes.ts';

const studyId = z.uuid('Étude inconnue.');
const parcelId = z.string().refine(isParcelId, 'Identifiant de parcelle invalide.');
const dateTime = z.iso.datetime();

export const StudyParcel = z.object({
  /** IDU, 14 caractères. */
  id: z.string(),
  communeCode: z.string(),
  prefix: z.string(),
  section: z.string(),
  number: z.string(),
  /** « AY 96 ». */
  label: z.string(),
  contenance: z.number().nullable(),
  /** Surface calculée, en m². */
  area: z.number(),
  /** Millésime du cadastre copié (`2026-09-01`). */
  version: z.string(),
  geometry: Surface,
});
export type StudyParcel = z.infer<typeof StudyParcel>;

export const StudySummary = z.object({
  id: z.string(),
  name: z.string(),
  communeCode: z.string(),
  communeName: z.string().nullable(),
  /** Libellé de l'adresse retenue. */
  addressLabel: z.string().nullable(),
  parcelCount: z.number().int(),
  /** Somme des contenances connues, en m². */
  contenance: z.number(),
  /** Somme des surfaces calculées, en m². */
  area: z.number(),
  /** Vignette (PNG), nulle tant que le worker ne l'a pas composée. */
  thumbnailUrl: z.string().nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
  /** Mise à la corbeille ; nulle sinon. */
  deletedAt: dateTime.nullable(),
  /** Date de la purge, pour une étude dans la corbeille. */
  purgeAt: dateTime.nullable(),
});
export type StudySummary = z.infer<typeof StudySummary>;

export const StudyStep = z.object({
  key: z.enum(['parcels', 'urbanism', 'risks', 'land', 'feasibility', 'report']),
  label: z.string(),
  state: z.enum(['done', 'todo', 'upcoming']),
  lot: z.string().nullable(),
});

export const Study = StudySummary.extend({
  parcels: z.array(StudyParcel),
  address: Address.nullable(),
  /** Adresses rattachées aux parcelles, la principale en tête. */
  addresses: z.array(Address),
  chosenAddressId: z.string().nullable(),
  /** Le nom attend encore l'adresse (il sera proposé par le worker). */
  nameIsProvisional: z.boolean(),
  /** Adresse ou vignette à recalculer pour les parcelles actuelles. */
  addressPending: z.boolean(),
  thumbnailPending: z.boolean(),
  /** Rayon des ventes comparables (F-05 Q2). */
  marketRadiusM: z.number().int(),
  steps: z.array(StudyStep),
});
export type Study = z.infer<typeof Study>;

export const StudiesQuery = z.object({
  /** Recherche dans le nom, la commune et l'adresse. */
  q: z.string().trim().max(100, 'Recherche trop longue.').optional(),
  /** Vrai : la corbeille. */
  trash: z.stringbool().default(false),
});

export const StudyCreate = z.object({
  parcelIds: z
    .array(parcelId, 'Sélectionnez au moins une parcelle.')
    .min(1, 'Sélectionnez au moins une parcelle.')
    .max(SELECTION_MAX, `Une étude compte au plus ${SELECTION_MAX} parcelles.`)
    .refine((ids) => new Set(ids).size === ids.length, 'Parcelle en double.'),
});

export const StudyUpdate = z
  .object({
    name: z.string('Nom invalide.').trim().min(1, 'Donnez un nom à l’étude.').max(STUDY_NAME_MAX, `Au plus ${STUDY_NAME_MAX} caractères.`).optional(),
    /** Identifiant BAN d'une des adresses trouvées. */
    addressId: z.string().min(1).optional(),
  })
  .refine((u) => u.name !== undefined || u.addressId !== undefined, 'Rien à modifier.');

const byId = z.object({ id: studyId });
const byParcel = z.object({ id: studyId, parcelId });

export const studyRoutes = {
  studies: route({
    method: 'GET',
    path: '/api/studies',
    summary: 'Mes études (ou ma corbeille), les plus récemment modifiées d’abord',
    body: undefined,
    query: StudiesQuery,
    response: z.object({ studies: z.array(StudySummary) }),
    status: 200,
    authenticated: true,
  }),
  studyCreate: route({
    method: 'POST',
    path: '/api/studies',
    summary: 'Crée une étude à partir d’une sélection de parcelles',
    body: StudyCreate,
    response: Study,
    status: 201,
    authenticated: true,
  }),
  study: route({
    method: 'GET',
    path: '/api/studies/:id',
    summary: 'Une étude : parcelles, adresses, étapes',
    body: undefined,
    params: byId,
    response: Study,
    status: 200,
    authenticated: true,
  }),
  studyUpdate: route({
    method: 'PATCH',
    path: '/api/studies/:id',
    summary: 'Renomme l’étude ou change son adresse',
    body: StudyUpdate,
    params: byId,
    response: Study,
    status: 200,
    authenticated: true,
  }),
  studyDelete: route({
    method: 'DELETE',
    path: '/api/studies/:id',
    summary: 'Met l’étude à la corbeille (purgée au bout de 30 jours)',
    body: undefined,
    params: byId,
    response: undefined,
    status: 204,
    authenticated: true,
  }),
  studyRestore: route({
    method: 'POST',
    path: '/api/studies/:id/restore',
    summary: 'Sort l’étude de la corbeille',
    body: undefined,
    params: byId,
    response: Study,
    status: 200,
    authenticated: true,
  }),
  studyDuplicate: route({
    method: 'POST',
    path: '/api/studies/:id/duplicate',
    summary: 'Copie l’étude (nom, adresse, parcelles)',
    body: undefined,
    params: byId,
    response: Study,
    status: 201,
    authenticated: true,
  }),
  studyParcelAdd: route({
    method: 'PUT',
    path: '/api/studies/:id/parcels/:parcelId',
    summary: 'Ajoute une parcelle à l’étude (sans effet si elle y est)',
    body: undefined,
    params: byParcel,
    response: Study,
    status: 200,
    authenticated: true,
  }),
  studyParcelRemove: route({
    method: 'DELETE',
    path: '/api/studies/:id/parcels/:parcelId',
    summary: 'Retire une parcelle de l’étude (jamais la dernière)',
    body: undefined,
    params: byParcel,
    response: Study,
    status: 200,
    authenticated: true,
  }),
  studyThumbnail: route({
    method: 'GET',
    path: '/api/studies/:id/thumbnail',
    summary: 'Vignette de l’étude (PNG)',
    body: undefined,
    params: byId,
    response: undefined,
    produces: 'image/png',
    status: 200,
    authenticated: true,
  }),
};
