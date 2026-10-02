// Contrat de l'analyse des risques d'une étude (F-04) : le résultat enregistré (schéma versionné,
// relu à chaque lecture) et les routes. Chaque donnée porte son état : `ok` ou `unavailable` (la
// source n'a pas répondu ; jamais confondu avec « aucun risque », Q4).
import { z } from 'zod';

import { route } from './routes.ts';

/** Version du schéma du résultat : un changement incompatible l'augmente, et l'analyse se refait. */
export const RISKS_VERSION = 2;

export function known<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('status', [z.object({ status: z.literal('ok'), data }), z.object({ status: z.literal('unavailable'), error: z.string() })]);
}

const Level = z.enum(['faible', 'moyen', 'fort']);
const lonLat = z.tuple([z.number(), z.number()]);

export const FloodHitSchema = z.object({
  type: z.enum(['01', '02', '03']),
  scenario: z.enum(['01FOR', '02MOY', '03MCC', '04FAI']),
  heightMin: z.number(),
  heightMax: z.number(),
});

export const RiskPlan = z.object({
  id: z.string(),
  kind: z.enum(['PPRN', 'PPRT', 'PPRM']),
  label: z.string(),
  model: z.string().nullable(),
  modifiedAt: z.string().nullable(),
  flood: z.boolean(),
  zones: z.array(z.object({ code: z.string().nullable(), label: z.string(), name: z.string().nullable() })),
  url: z.string(),
  /** Avec le jeton de l'API v2 seulement (sinon nuls) : état pour la commune et dates « JJ/MM/AAAA ». */
  state: z.enum(['approved', 'prescribed', 'repealed']).nullable(),
  approvedAt: z.string().nullable(),
  prescribedAt: z.string().nullable(),
  /** Aléas couverts (« Inondation », « Mouvement de terrain »…). */
  hazards: z.array(z.string()),
  /** Page du PPR sur le site de la préfecture. */
  prefectureUrl: z.string().nullable(),
});
export type RiskPlan = z.infer<typeof RiskPlan>;

export const CommuneRisks = z.object({
  code: z.string(),
  name: z.string().nullable(),
  radon: known(z.number().nullable()),
  seismic: known(z.number().nullable()),
  hazards: known(z.array(z.object({ code: z.string(), label: z.string() }))),
  plans: known(z.array(RiskPlan)),
  catnat: known(
    z.object({
      count: z.number().int(),
      truncated: z.boolean(),
      /** Les plus récents d'abord, 10 au plus. */
      latest: z.array(z.object({ id: z.string(), label: z.string(), start: z.string().nullable(), published: z.string().nullable() })),
    }),
  ),
});
export type CommuneRisks = z.infer<typeof CommuneRisks>;

export const ParcelRisks = z.object({
  id: z.string(),
  label: z.string(),
  /** Point intérieur à la parcelle, où les couches ont été interrogées. */
  point: lonLat,
  clay: known(Level.nullable()),
  flood: known(
    z.object({
      hazard: Level.nullable(),
      scenarios: z.array(FloodHitSchema),
      /** Hauteur d'eau du scénario moyen ; `atLeast` pour une classe ouverte (« plus de 2 m »). */
      reference: z.object({ height: z.number(), atLeast: z.boolean() }).nullable(),
    }),
  ),
  elevation: known(z.object({ min: z.number(), max: z.number(), mean: z.number(), range: z.number(), points: z.number().int() }).nullable()),
  /** Altitude moyenne + hauteur d'eau du scénario moyen, m NGF : indicative (Q5) ; « au moins » pour une classe ouverte. */
  floodLevel: z.object({ level: z.number(), atLeast: z.boolean() }).nullable(),
});
export type ParcelRisks = z.infer<typeof ParcelRisks>;

const near = { distanceM: z.number() };

export const RisksResult = z.object({
  version: z.literal(RISKS_VERSION),
  communes: z.array(CommuneRisks),
  parcels: z.array(ParcelRisks),
  /** Centre de l'emprise, d'où partent les recherches alentour. */
  center: lonLat,
  /** Rayons de recherche autour de l'emprise, en mètres : alentours (cavités, installations, sols pollués) et bornes. */
  radii: z.object({ nearbyM: z.number(), hydrantsM: z.number() }),
  cavities: known(z.object({ truncated: z.boolean(), items: z.array(z.object({ id: z.string(), name: z.string().nullable(), type: z.string().nullable(), point: lonLat, ...near })) })),
  installations: known(
    z.object({
      /** Installations classées des communes de l'étude (toutes distances). */
      count: z.number().int(),
      truncated: z.boolean(),
      items: z.array(z.object({ id: z.string().nullable(), name: z.string(), regime: z.string().nullable(), seveso: z.string().nullable(), point: lonLat, ...near })),
    }),
  ),
  pollutedSites: known(
    z.object({
      count: z.number().int(),
      truncated: z.boolean(),
      items: z.array(z.object({ id: z.string(), kind: z.enum(['SIS', 'CASIAS']), name: z.string().nullable(), url: z.string().nullable(), ...near })),
    }),
  ),
  hydrants: known(
    z.object({
      /** Date des bornes connues les plus anciennes (cases de 30 jours au plus, ou plus en cas de panne d'Overpass). */
      asOf: z.iso.datetime(),
      items: z.array(
        z.object({ id: z.string(), point: lonLat, type: z.string().nullable(), flowRate: z.string().nullable(), diameter: z.string().nullable(), ref: z.string().nullable(), ...near }),
      ),
    }),
  ),
});
export type RisksResult = z.infer<typeof RisksResult>;

export const RiskAxis = z.object({
  key: z.enum(['flood', 'clay', 'radon', 'seismic']),
  label: z.string(),
  state: z.string(),
  severity: z.enum(['none', 'low', 'medium', 'high', 'unknown']),
  detail: z.string().nullable(),
});

/**
 * Une étape du calcul, enregistrée au fil de l'analyse : ce que le worker interroge, où il en est, ce
 * qu'il a trouvé. `partial` : une partie des sources de l'étape n'a pas répondu.
 */
export const AnalysisStep = z.object({
  key: z.string(),
  label: z.string(),
  state: z.enum(['pending', 'running', 'done', 'partial', 'unavailable']),
  /** Ce qui a été trouvé, ou pourquoi la source manque. */
  detail: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});
export type AnalysisStep = z.infer<typeof AnalysisStep>;

export const RiskSource = z.object({ key: z.string(), label: z.string(), url: z.string(), licence: z.string() });

export const StudyRisks = z.object({
  /** `none` : jamais demandée. */
  status: z.enum(['none', 'queued', 'running', 'ready', 'failed']),
  /** Les parcelles ont changé depuis le calcul : à refaire. */
  stale: z.boolean(),
  requestedAt: z.iso.datetime().nullable(),
  computedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
  result: RisksResult.nullable(),
  /** Synthèse des quatre axes, la plus sévère d'abord. */
  axes: z.array(RiskAxis).nullable(),
  /** Surcoûts indicatifs de construction, en € HT par m² de surface de plancher (Q9). */
  surcharges: z
    .array(
      z.object({ key: z.enum(['flood', 'radon', 'seismic']), label: z.string(), perM2: z.number(), basis: z.string(), source: z.string(), sourced: z.boolean() }),
    )
    .nullable(),
  sources: z.array(RiskSource),
  /** Déroulé du dernier calcul (en cours ou fini), étape par étape. */
  progress: z.array(AnalysisStep),
});
export type StudyRisks = z.infer<typeof StudyRisks>;

const byId = z.object({ id: z.uuid('Étude inconnue.') });

export const riskRoutes = {
  studyRisks: route({
    method: 'GET',
    path: '/api/studies/:id/risks',
    summary: 'Analyse des risques de l’étude (et si elle est périmée)',
    body: undefined,
    params: byId,
    response: StudyRisks,
    status: 200,
    authenticated: true,
  }),
  studyRisksRequest: route({
    method: 'POST',
    path: '/api/studies/:id/risks',
    summary: 'Demande l’analyse des risques (sans effet si elle est à jour ou en cours, sauf `force`)',
    body: z.object({ force: z.boolean().default(false) }),
    params: byId,
    response: StudyRisks,
    status: 202,
    authenticated: true,
  }),
};
