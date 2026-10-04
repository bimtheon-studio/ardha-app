// Contrat de l'analyse de marché d'une étude (F-05) : le résultat enregistré (schéma versionné, relu
// à chaque lecture), les ventes du cercle et les routes. Chaque source porte son état : `ok` ou
// `unavailable` (DT-34) ; une source muette ne se lit jamais comme « aucune vente ».
import { z } from 'zod';

import { AnalysisStep, known } from './risks.ts';
import { route } from './routes.ts';

/** Version du schéma du résultat : un changement incompatible l'augmente, et l'analyse se refait. */
export const MARKET_VERSION = 1;

const lonLat = z.tuple([z.number(), z.number()]);
export const SaleCategorySchema = z.enum(['house', 'apartment', 'land']);
export const SaleSegmentSchema = z.enum(['existing', 'new']);
export const PropertyTypeSchema = z.enum(['house', 'apartment', 'commercial', 'outbuilding', 'land', 'other']);
export const MarketRadius = z.union([z.literal(250), z.literal(500), z.literal(1000), z.literal(2000)]);

const Summary = z.object({ count: z.number().int(), median: z.number(), p25: z.number(), p75: z.number() });

export const PriceIndicatorSchema = z.object({
  category: SaleCategorySchema,
  segment: SaleSegmentSchema,
  /** 12 mois jusqu'à la dernière vente connue. */
  current: Summary.nullable(),
  previous: Summary.nullable(),
  trendPct: z.number().nullable(),
  lowSample: z.boolean(),
});
export type PriceIndicatorJson = z.infer<typeof PriceIndicatorSchema>;

const HistoryPointSchema = z.object({
  period: z.string(),
  category: SaleCategorySchema,
  segment: SaleSegmentSchema,
  count: z.number().int(),
  median: z.number(),
});

export const MarketResult = z.object({
  version: z.literal(MARKET_VERSION),
  /** Centre des parcelles de l'étude. */
  center: lonLat,
  radiusM: MarketRadius,
  /** Faux en Alsace-Moselle et à Mayotte, que DVF ne couvre pas. */
  covered: z.boolean(),
  dvf: known(
    z.object({
      /** Départements touchés par le cercle et millésimes lus, avec la date de chaque fichier. */
      departments: z.array(z.object({ code: z.string(), years: z.array(z.object({ year: z.number().int(), modifiedAt: z.string() })) })),
      /** Première et dernière dates de vente couvertes (`AAAA-MM-JJ`). */
      from: z.string().nullable(),
      horizon: z.string().nullable(),
      /** Ventes du cercle, et celles qui comptent dans les prix (Q3). */
      saleCount: z.number().int(),
      comparableCount: z.number().int(),
      indicators: z.array(PriceIndicatorSchema),
      history: z.object({ year: z.array(HistoryPointSchema), quarter: z.array(HistoryPointSchema) }),
      communes: z.array(z.object({ code: z.string(), name: z.string().nullable(), sales: z.number().int() })),
    }),
  ),
  /** ECLN du département (Q6) : les 4 derniers trimestres publiés, collectif et individuel. */
  newBuild: known(
    z.object({
      department: z.string(),
      quarters: z.array(
        z.object({
          quarter: z.string(),
          housingType: z.enum(['collective', 'individual', 'all']),
          pricePerM2: z.number().nullable(),
          averagePrice: z.number().nullable(),
          reservations: z.number().nullable(),
          listed: z.number().nullable(),
          stock: z.number().nullable(),
          monthsToSell: z.number().nullable(),
        }),
      ),
    }),
  ),
  /** Sitadel (Q7) : logements autorisés et commencés de la commune de l'étude, 8 dernières années. */
  permits: known(
    z.object({
      communeCode: z.string(),
      communeName: z.string().nullable(),
      asOf: z.iso.datetime(),
      rows: z.array(
        z.object({
          year: z.number().int(),
          housingType: z.string(),
          authorizedUnits: z.number().nullable(),
          startedUnits: z.number().nullable(),
          authorizedArea: z.number().nullable(),
          startedArea: z.number().nullable(),
        }),
      ),
    }),
  ),
  /** Indices INSEE (Q8) : construction, prix de l'ancien de la zone et national. */
  indices: known(
    z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        kind: z.enum(['construction', 'existing-prices']),
        propertyType: z.enum(['house', 'apartment']).nullable(),
        last: z.object({ period: z.string(), value: z.number() }),
        yearChangePct: z.number().nullable(),
      }),
    ),
  ),
});
export type MarketResult = z.infer<typeof MarketResult>;

export const MarketSource = z.object({ key: z.string(), label: z.string(), url: z.string(), licence: z.string() });

export const StudyMarket = z.object({
  /** `none` : jamais demandée. */
  status: z.enum(['none', 'queued', 'running', 'ready', 'failed']),
  /** Rayon choisi pour l'étude. */
  radiusM: MarketRadius,
  /** Les parcelles ou le rayon ont changé depuis le calcul : à refaire. */
  stale: z.boolean(),
  /** Un millésime DVF plus récent que ceux de l'analyse est chargé. */
  newerData: z.boolean(),
  requestedAt: z.iso.datetime().nullable(),
  computedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
  result: MarketResult.nullable(),
  sources: z.array(MarketSource),
  progress: z.array(AnalysisStep),
});
export type StudyMarket = z.infer<typeof StudyMarket>;

export const MarketSale = z.object({
  id: z.string(),
  date: z.string(),
  nature: z.string(),
  vefa: z.boolean(),
  price: z.number(),
  propertyType: PropertyTypeSchema,
  /** Comment la vente compte dans les prix, ou `null` si elle n'y compte pas (Q3). */
  category: SaleCategorySchema.nullable(),
  pricePerM2: z.number().nullable(),
  builtArea: z.number().nullable(),
  landArea: z.number().nullable(),
  rooms: z.number().nullable(),
  dwellingCount: z.number().int(),
  address: z.string().nullable(),
  postcode: z.string().nullable(),
  communeCode: z.string(),
  position: lonLat,
  distanceM: z.number(),
  /** Parcelles vendues dont le cadastre est chargé (Q10), avec leur contour. */
  parcels: z.array(z.object({ id: z.string(), geometry: z.unknown() })),
  /** Parcelles vendues, chargées ou non. */
  parcelIds: z.array(z.string()),
});
export type MarketSale = z.infer<typeof MarketSale>;

export const MARKET_SALES_LIMIT = 1500;

export const MarketSales = z.object({
  center: lonLat,
  radiusM: MarketRadius,
  sales: z.array(MarketSale),
  /** Plus de ventes que la limite : les plus récentes seulement. */
  truncated: z.boolean(),
});
export type MarketSales = z.infer<typeof MarketSales>;

const byId = z.object({ id: z.uuid('Étude inconnue.') });

export const SalesQuery = z.object({
  type: z.enum(['all', 'house', 'apartment', 'land', 'commercial', 'outbuilding', 'other']).default('all'),
  segment: z.enum(['all', 'existing', 'new']).default('all'),
  /** Année de la première vente gardée. */
  from: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const marketRoutes = {
  studyMarket: route({
    method: 'GET',
    path: '/api/studies/:id/market',
    summary: 'Analyse de marché de l’étude (et si elle est périmée)',
    body: undefined,
    params: byId,
    response: StudyMarket,
    status: 200,
    authenticated: true,
  }),
  studyMarketRequest: route({
    method: 'POST',
    path: '/api/studies/:id/market',
    summary: 'Change le rayon et demande l’analyse de marché (sans effet si elle est à jour ou en cours, sauf `force`)',
    body: z.object({ force: z.boolean().default(false), radiusM: MarketRadius.optional() }),
    params: byId,
    response: StudyMarket,
    status: 202,
    authenticated: true,
  }),
  studyMarketSales: route({
    method: 'GET',
    path: '/api/studies/:id/market/sales',
    summary: 'Ventes DVF dans le rayon de l’étude, les plus récentes d’abord, avec les parcelles vendues',
    body: undefined,
    params: byId,
    query: SalesQuery,
    response: MarketSales,
    status: 200,
    authenticated: true,
  }),
};
