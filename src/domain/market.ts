import type { SaleCategory, SaleSegment } from './dvf.ts';
import { bboxOf, type Position, type Surface, unionBbox } from './geometry.ts';

// Marché autour d'une étude (F-05) : médianes, tendance sur 12 mois glissants, historique, calendrier
// de publication de DVF, catalogue des indices INSEE, échelle de couleurs des prix. Arbitré en F-05
// Q2 (rayon fixe), Q4 (médiane sur 12 mois), Q8 (indices) ; bornes IQR et échelle P10–P90 reprises
// de l'ancien code (`_shared/dvf.ts:448-455`, `utils/dvfPriceScale.ts` @2a7f9a0).

/** Rayons proposés, en mètres (Q2) ; jamais d'élargissement automatique. */
export const MARKET_RADII: readonly number[] = [250, 500, 1000, 2000];
export const DEFAULT_MARKET_RADIUS_M = 500;
/** Sous ce nombre de ventes, l'écran avertit et propose d'élargir (Q2, Q4). */
export const LOW_SAMPLE_SALES = 20;
/** Ventes minimales de chaque période pour donner une tendance. */
export const MIN_TREND_SALES = 5;
/** Ventes minimales d'une période de l'historique. */
export const MIN_PERIOD_SALES = 3;

/**
 * Empreinte de l'analyse de marché : celle des parcelles et le rayon. Un rayon changé rend
 * l'analyse périmée, comme des parcelles changées.
 */
export function marketKey(parcelsKey: string, radiusM: number): string {
  return `${parcelsKey}@${radiusM}`;
}

/** Types de logements de l'ECLN : collectif, individuel, ensemble. */
export type HousingType = 'collective' | 'individual' | 'all';

/** Une ligne de l'ECLN (SDES) : un département, un trimestre, un type de logement. */
export interface NewBuildRow {
  department: string;
  /** `2026-T2`. */
  quarter: string;
  housingType: HousingType;
  /** Mises en vente. */
  listed: number | null;
  reservations: number | null;
  cancellations: number | null;
  stock: number | null;
  /** Délai d'écoulement, en mois. */
  monthsToSell: number | null;
  /** Prix moyen au m² des réservations (collectif) ; nul quand le trimestre n'a pas de vente. */
  pricePerM2: number | null;
  /** Prix moyen d'un logement individuel. */
  averagePrice: number | null;
}

export interface PermitRow {
  communeCode: string;
  year: number;
  /** `all`, `individual-detached` (individuel pur), `individual-grouped`, `collective`, `residence`. */
  housingType: string;
  authorizedUnits: number | null;
  startedUnits: number | null;
  authorizedArea: number | null;
  startedArea: number | null;
}

export function isMarketRadius(value: number): boolean {
  return MARKET_RADII.includes(value);
}

/** Quantile `q` (0..1) d'une liste triée, par interpolation linéaire. */
export function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Écarte les valeurs hors de [Q1 − 1,5 IQR ; Q3 + 1,5 IQR], dès 4 valeurs ; rend la liste triée. */
export function filterIqr(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 4) return sorted;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return sorted.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
}

export interface PriceSummary {
  /** Ventes retenues, après le filtre IQR. */
  count: number;
  median: number;
  p25: number;
  p75: number;
}

export function summarizePrices(values: readonly number[]): PriceSummary | null {
  const kept = filterIqr(values);
  if (kept.length === 0) return null;
  return {
    count: kept.length,
    median: Math.round(quantile(kept, 0.5)),
    p25: Math.round(quantile(kept, 0.25)),
    p75: Math.round(quantile(kept, 0.75)),
  };
}

/** Une vente comparable, réduite à ce que les statistiques lisent. */
export interface PricedSale {
  /** `AAAA-MM-JJ`. */
  date: string;
  category: SaleCategory;
  segment: SaleSegment;
  pricePerM2: number;
}

/** Date `AAAA-MM-JJ` décalée de `months` mois (fin de mois tronquée). */
export function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export interface PriceIndicator {
  category: SaleCategory;
  segment: SaleSegment;
  /** 12 mois jusqu'à la dernière vente connue. */
  current: PriceSummary | null;
  /** Les 12 mois d'avant. */
  previous: PriceSummary | null;
  /** Évolution de la médiane, en % ; nulle si une période a trop peu de ventes. */
  trendPct: number | null;
  /** Moins de `LOW_SAMPLE_SALES` ventes sur les 12 derniers mois. */
  lowSample: boolean;
}

/**
 * Prix courant et tendance (Q4) : médiane des 12 mois qui finissent à `horizon` (dernière date
 * couverte par DVF), comparée aux 12 mois précédents.
 */
export function priceIndicators(sales: readonly PricedSale[], horizon: string): PriceIndicator[] {
  const yearAgo = shiftMonths(horizon, -12);
  const twoYearsAgo = shiftMonths(horizon, -24);
  const out: PriceIndicator[] = [];
  for (const category of ['house', 'apartment', 'land'] as const) {
    for (const segment of ['existing', 'new'] as const) {
      const of = sales.filter((s) => s.category === category && s.segment === segment);
      const current = summarizePrices(of.filter((s) => s.date > yearAgo && s.date <= horizon).map((s) => s.pricePerM2));
      const previous = summarizePrices(of.filter((s) => s.date > twoYearsAgo && s.date <= yearAgo).map((s) => s.pricePerM2));
      const trendPct =
        current && previous && current.count >= MIN_TREND_SALES && previous.count >= MIN_TREND_SALES
          ? Math.round((current.median / previous.median - 1) * 1000) / 10
          : null;
      out.push({ category, segment, current, previous, trendPct, lowSample: (current?.count ?? 0) < LOW_SAMPLE_SALES });
    }
  }
  return out;
}

export type HistoryGranularity = 'year' | 'quarter';

export interface HistoryPoint {
  /** `2024` ou `2024-T1`. */
  period: string;
  category: SaleCategory;
  segment: SaleSegment;
  count: number;
  median: number;
}

export function periodOf(date: string, granularity: HistoryGranularity): string {
  const year = date.slice(0, 4);
  if (granularity === 'year') return year;
  return `${year}-T${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
}

/** Médiane par période, type et segment, pour les périodes d'au moins `MIN_PERIOD_SALES` ventes. */
export function priceHistory(sales: readonly PricedSale[], granularity: HistoryGranularity): HistoryPoint[] {
  const groups = new Map<string, number[]>();
  for (const s of sales) {
    const key = `${periodOf(s.date, granularity)}|${s.category}|${s.segment}`;
    const group = groups.get(key);
    if (group) group.push(s.pricePerM2);
    else groups.set(key, [s.pricePerM2]);
  }
  const out: HistoryPoint[] = [];
  for (const [key, prices] of groups) {
    const [period, category, segment] = key.split('|') as [string, SaleCategory, SaleSegment];
    const summary = summarizePrices(prices)!;
    if (summary.count < MIN_PERIOD_SALES) continue;
    out.push({ period, category, segment, count: summary.count, median: summary.median });
  }
  return out.sort((a, b) => a.period.localeCompare(b.period) || a.category.localeCompare(b.category) || a.segment.localeCompare(b.segment));
}

/** Écart du neuf sur l'ancien, en %. */
export function newBuildPremiumPct(newMedian: number | null | undefined, existingMedian: number | null | undefined): number | null {
  if (!newMedian || !existingMedian) return null;
  return Math.round((newMedian / existingMedian - 1) * 1000) / 10;
}

/** Centre du cercle des comparables : le centre de la boîte des parcelles, arrondi à 6 décimales. */
export function marketCenter(geometries: readonly Surface[]): [number, number] {
  const [w, s, e, n] = unionBbox(geometries.map(bboxOf))!;
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return [round((w + e) / 2), round((s + n) / 2)];
}

/**
 * Points où chercher les départements touchés par le cercle : son centre et 8 points du bord.
 * Approximation locale (1° de latitude ≈ 111,32 km), juste à l'échelle de quelques kilomètres.
 */
export function circleProbes(center: Position, radiusM: number): Position[] {
  const [lon, lat] = center as [number, number];
  const dLat = radiusM / 111_320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const out: Position[] = [[lon, lat]];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    out.push([Math.round((lon + dLon * Math.cos(a)) * 1e6) / 1e6, Math.round((lat + dLat * Math.sin(a)) * 1e6) / 1e6]);
  }
  return out;
}

// Calendrier de DVF : la DGFiP publie en avril et en octobre et remplace les fichiers entiers
// (ancien `_shared/fraicheur.ts:24-27`). Une copie se relit dès qu'une publication est passée
// depuis la dernière vérification.

export const DVF_PUBLICATIONS: readonly { month: number; day: number }[] = [
  { month: 4, day: 1 },
  { month: 10, day: 1 },
];

/** Première publication strictement après `after`. */
export function nextDvfPublication(after: Date): Date {
  const year = after.getUTCFullYear();
  return [year, year + 1]
    .flatMap((y) => DVF_PUBLICATIONS.map((p) => new Date(Date.UTC(y, p.month - 1, p.day))))
    .find((d) => d > after)!;
}

/** Vrai si une publication est passée depuis `checkedAt`. */
export function dvfCheckDue(checkedAt: Date, now: Date): boolean {
  return now >= nextDvfPublication(checkedAt);
}

// Indices INSEE (Q8) : coût de la construction (ICC), index du bâtiment (BT01), indices des prix des
// logements anciens INSEE-Notaires, séries CVS en base 100 en 2015 (catalogue relevé sur bdm.insee.fr
// le 02/10/2026). Les séries « prix de l'ancien » de l'ancien code étaient fausses : `001565183` est
// un coût du travail, `001565207` une balance commerciale.

export type IndexKind = 'construction' | 'existing-prices';

export interface IndexSeries {
  id: string;
  label: string;
  kind: IndexKind;
  frequency: 'month' | 'quarter';
  propertyType?: 'house' | 'apartment';
}

const construction: IndexSeries[] = [
  { id: '000008630', label: 'Indice du coût de la construction (ICC)', kind: 'construction', frequency: 'quarter' },
  { id: '001710986', label: 'Index du bâtiment BT01, tous corps d’état', kind: 'construction', frequency: 'month' },
];

const prices = (zone: string, apartment: string, house?: string): IndexSeries[] => [
  { id: apartment, label: `Prix des appartements anciens, ${zone}`, kind: 'existing-prices', frequency: 'quarter', propertyType: 'apartment' },
  ...(house ? [{ id: house, label: `Prix des maisons anciennes, ${zone}`, kind: 'existing-prices', frequency: 'quarter', propertyType: 'house' } as IndexSeries] : []),
];

/** Séries locales d'Île-de-France, par département (Paris : appartements seulement). */
const ILE_DE_FRANCE: Record<string, IndexSeries[]> = {
  '75': prices('Paris', '010567013'),
  '77': prices('Seine-et-Marne', '010567015', '010567019'),
  '78': prices('Yvelines', '010567021', '010567025'),
  '91': prices('Essonne', '010567027', '010567031'),
  '92': prices('Hauts-de-Seine', '010567033', '010567037'),
  '93': prices('Seine-Saint-Denis', '010567039', '010567043'),
  '94': prices('Val-de-Marne', '010567045', '010567049'),
  '95': prices('Val-d’Oise', '010567051', '010567055'),
};
const PROVINCE = prices('province', '010567063', '010567075');
const METROPOLE = prices('France métropolitaine', '010567057', '010567061');
const FRANCE = prices('France hors Mayotte', '010567117', '010567121');

/** Toutes les séries que le worker tient à jour. */
export const INDEX_SERIES: readonly IndexSeries[] = [
  ...construction,
  ...Object.values(ILE_DE_FRANCE).flat(),
  ...PROVINCE,
  ...METROPOLE,
  ...FRANCE,
];

/** Séries lues pour une étude : construction, zone (département d'Île-de-France ou province), national. */
export function indexSeriesFor(departmentCode: string): IndexSeries[] {
  if (departmentCode.startsWith('97')) return [...construction, ...FRANCE];
  return [...construction, ...(ILE_DE_FRANCE[departmentCode] ?? PROVINCE), ...METROPOLE];
}

export interface IndexValue {
  /** `2026-Q2` (trimestre) ou `2026-07` (mois). */
  period: string;
  value: number;
}

/** Période un an plus tôt : `2026-Q2` → `2025-Q2`, `2026-07` → `2025-07`. */
export function periodYearBefore(period: string): string {
  return `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
}

/** Dernière valeur et son évolution sur un an, en % (nulle sans la valeur d'il y a un an). */
export function indexSummary(values: readonly IndexValue[]): { last: IndexValue; yearChangePct: number | null } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a.period.localeCompare(b.period));
  const last = sorted.at(-1)!;
  const before = sorted.find((v) => v.period === periodYearBefore(last.period));
  return { last, yearChangePct: before ? Math.round((last.value / before.value - 1) * 1000) / 10 : null };
}

// Échelle de couleurs des prix au m² (ancien `utils/dvfPriceScale.ts`) : bornes P10–P90 des ventes
// visibles, pour qu'un château ou un garage n'écrase pas tout le dégradé.

export interface PriceScale {
  lo: number;
  hi: number;
  count: number;
}

export function priceScale(pricesPerM2: readonly number[]): PriceScale | null {
  const sorted = pricesPerM2.filter((p) => p > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))]!;
  const lo = q(0.1);
  return { lo, hi: Math.max(q(0.9), lo + 1), count: sorted.length };
}

/** Bleu → cyan → vert → jaune → rouge. */
export const PRICE_GRADIENT: readonly (readonly [number, readonly [number, number, number]])[] = [
  [0, [37, 99, 235]],
  [0.25, [34, 211, 238]],
  [0.5, [74, 222, 128]],
  [0.75, [250, 204, 21]],
  [1, [239, 68, 68]],
];

export function priceColor(pricePerM2: number, scale: PriceScale): string {
  const t = Math.max(0, Math.min(1, (pricePerM2 - scale.lo) / (scale.hi - scale.lo)));
  const i = Math.max(1, PRICE_GRADIENT.findIndex(([stop]) => t <= stop));
  const [t0, c0] = PRICE_GRADIENT[i - 1]!;
  const [t1, c1] = PRICE_GRADIENT[i]!;
  const f = (t - t0) / (t1 - t0);
  const [r, g, b] = c0.map((c, k) => Math.round(c + (c1[k]! - c) * f));
  return `rgb(${r},${g},${b})`;
}
