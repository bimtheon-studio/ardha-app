import { interiorPoint, perimeterPoints, type Position, type Surface } from './geometry.ts';

// Risques d'une étude (F-04) : aléa inondation des cartes TRI, classes d'argiles, de radon et de
// sismicité, synthèse des quatre axes. Repris de l'ancien code (`usePPRIFloodZone.ts:120-126`,
// `CommunalRisksBanner.tsx:47-185` @2a7f9a0), avec un état « indisponible » qui ne se confond plus
// avec « aucun risque » (F-04, Q4).

/** Couches de hauteurs d'eau des TRI (WMS BRGM `georisques/risques`), liste exacte du service. */
export const FLOOD_LAYERS = [
  'ISO_HT_01_01FOR',
  'ISO_HT_01_02MOY',
  'ISO_HT_01_04FAI',
  'ISO_HT_02_01FOR',
  'ISO_HT_02_02MOY',
  'ISO_HT_02_04FAI',
  'ISO_HT_03_01FOR',
  'ISO_HT_03_02MOY',
  'ISO_HT_03_03MCC',
  'ISO_HT_03_04FAI',
] as const;

export type FloodType = '01' | '02' | '03';
export type FloodScenario = '01FOR' | '02MOY' | '03MCC' | '04FAI';

export const FLOOD_TYPE_LABELS: Record<FloodType, string> = {
  '01': 'Débordement de cours d’eau',
  '02': 'Débordement de cours d’eau endigué',
  '03': 'Submersion marine',
};

export const FLOOD_SCENARIO_LABELS: Record<FloodScenario, string> = {
  '01FOR': 'fréquent',
  '02MOY': 'moyen (centennal)',
  '03MCC': 'moyen avec changement climatique',
  '04FAI': 'extrême',
};

/** Une classe de hauteur d'eau qui couvre le point, pour un type et un scénario. */
export interface FloodHit {
  type: FloodType;
  scenario: FloodScenario;
  /** Bornes de la classe, en mètres. */
  heightMin: number;
  heightMax: number;
}

export type Level = 'faible' | 'moyen' | 'fort';

/** Inondé dès le scénario fréquent → fort ; au moyen → moyen ; à l'extrême seul → faible. */
export function floodHazard(hits: readonly FloodHit[]): Level | null {
  if (hits.length === 0) return null;
  const scenarios = new Set(hits.map((h) => h.scenario));
  if (scenarios.has('01FOR')) return 'fort';
  if (scenarios.has('02MOY') || scenarios.has('03MCC')) return 'moyen';
  return 'faible';
}

/** Un résultat par type et scénario : la classe la plus haute. Ordre : type, puis scénario. */
export function floodScenarios(hits: readonly FloodHit[]): FloodHit[] {
  const byKey = new Map<string, FloodHit>();
  for (const h of hits) {
    const key = `${h.type}-${h.scenario}`;
    const known = byKey.get(key);
    if (!known || h.heightMax > known.heightMax) byKey.set(key, h);
  }
  return [...byKey.values()].sort((a, b) => a.type.localeCompare(b.type) || a.scenario.localeCompare(b.scenario));
}

/**
 * Borne haute à partir de laquelle une classe est ouverte : le service code « plus de 2 m » par
 * `ht_min = 2`, `ht_max = 10` (constaté à Maisons-Alfort le 01/10/2026).
 */
export const OPEN_CLASS_MAX = 10;

export function isOpenClass(h: Pick<FloodHit, 'heightMax'>): boolean {
  return h.heightMax >= OPEN_CLASS_MAX;
}

/** « 0,5 à 1 m », « plus de 2 m ». */
export function floodClassLabel(h: Pick<FloodHit, 'heightMin' | 'heightMax'>): string {
  const n = (v: number) => v.toLocaleString('fr-FR');
  return isOpenClass(h) ? `plus de ${n(h.heightMin)} m` : `${n(h.heightMin)} à ${n(h.heightMax)} m`;
}

/**
 * Hauteur d'eau de référence (F-04, Q5) : la plus haute classe du scénario moyen (centennal, ou avec
 * changement climatique en submersion marine) ; nulle hors de ces scénarios. Pour une classe ouverte,
 * sa borne basse, et `atLeast` : la hauteur réelle est au moins celle-là.
 */
export function referenceFloodHeight(hits: readonly FloodHit[]): { height: number; atLeast: boolean } | null {
  const reference = hits.filter((h) => h.scenario === '02MOY' || h.scenario === '03MCC');
  let best: { height: number; atLeast: boolean } | null = null;
  for (const h of reference) {
    const height = isOpenClass(h) ? h.heightMin : h.heightMax;
    if (!best || height > best.height) best = { height, atLeast: isOpenClass(h) };
  }
  return best;
}

const LEVEL_ORDER: Record<Level, number> = { faible: 1, moyen: 2, fort: 3 };

export function worstLevel(levels: readonly (Level | null)[]): Level | null {
  return levels.reduce<Level | null>((w, l) => (l && (!w || LEVEL_ORDER[l] > LEVEL_ORDER[w]) ? l : w), null);
}

/** Exposition au retrait-gonflement des argiles (RGA) : code 1, 2, 3 de Géorisques. */
export function clayLevel(code: string | null | undefined): Level | null {
  return ({ '1': 'faible', '2': 'moyen', '3': 'fort' } as const)[code ?? ''] ?? null;
}

export type Severity = 'none' | 'low' | 'medium' | 'high' | 'unknown';
export type AxisKey = 'flood' | 'clay' | 'radon' | 'seismic';

export interface Axis {
  key: AxisKey;
  label: string;
  state: string;
  severity: Severity;
  detail: string | null;
}

/** `'unavailable'` : la source n'a pas répondu ; à ne jamais lire comme « aucun risque ». */
export type Known<T> = T | 'unavailable';

export interface AxesInput {
  /** Pire aléa des parcelles sur les cartes TRI (`null` : hors zone). */
  floodHazard: Known<Level | null>;
  /** Un PPR inondation (ou submersion) existe sur une commune de l'étude. */
  floodPlan: Known<boolean>;
  clay: Known<Level | null>;
  /** Pire classe des communes, 1 à 3. */
  radon: Known<number | null>;
  /** Pire zone des communes, 1 à 5. */
  seismic: Known<number | null>;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 4, medium: 3, low: 2, unknown: 1, none: 0 };
const UNAVAILABLE = 'Source indisponible : à vérifier';
const LEVEL_SEVERITY: Record<Level, Severity> = { faible: 'low', moyen: 'medium', fort: 'high' };
const RADON_LABELS: Record<number, string> = { 1: 'Faible', 2: 'Faible, avec facteurs de transfert', 3: 'Significatif' };
const SEISMIC_LABELS: Record<number, string> = { 1: 'Très faible', 2: 'Faible', 3: 'Modérée', 4: 'Moyenne', 5: 'Forte' };

function floodAxis({ floodHazard: hazard, floodPlan: plan }: AxesInput): Axis {
  const axis = { key: 'flood' as const, label: 'Inondation' };
  if (hazard !== 'unavailable' && hazard !== null) {
    return { ...axis, state: `Aléa ${hazard}`, severity: LEVEL_SEVERITY[hazard], detail: 'Parcelle en zone inondable sur les cartes des territoires à risque (TRI)' };
  }
  if (plan === true) {
    return { ...axis, state: 'PPR inondation sur la commune', severity: 'medium', detail: 'Vérifier le zonage réglementaire du PPR sur la parcelle' };
  }
  if (hazard === 'unavailable' || plan === 'unavailable') return { ...axis, state: UNAVAILABLE, severity: 'unknown', detail: null };
  return { ...axis, state: 'Hors zone inondable connue', severity: 'none', detail: 'Ni carte TRI, ni PPR inondation sur la commune' };
}

function clayAxis({ clay }: AxesInput): Axis {
  const axis = { key: 'clay' as const, label: 'Retrait-gonflement des argiles' };
  if (clay === 'unavailable') return { ...axis, state: UNAVAILABLE, severity: 'unknown', detail: null };
  if (clay === null) return { ...axis, state: 'Hors zone d’exposition', severity: 'none', detail: null };
  return {
    ...axis,
    state: `Exposition ${clay}`,
    severity: LEVEL_SEVERITY[clay],
    detail: clay === 'faible' ? null : 'Étude géotechnique G1 à la vente, G2 avant construction (loi ELAN, art. 68)',
  };
}

function radonAxis({ radon }: AxesInput): Axis {
  const axis = { key: 'radon' as const, label: 'Radon' };
  if (radon === 'unavailable') return { ...axis, state: UNAVAILABLE, severity: 'unknown', detail: null };
  if (radon === null || !RADON_LABELS[radon]) return { ...axis, state: 'Classe inconnue', severity: 'unknown', detail: null };
  return {
    ...axis,
    state: `Classe ${radon} · ${RADON_LABELS[radon]}`,
    severity: radon >= 3 ? 'high' : radon === 2 ? 'medium' : 'low',
    detail: radon >= 3 ? 'Étanchéité et ventilation à prévoir au rez-de-chaussée' : null,
  };
}

function seismicAxis({ seismic }: AxesInput): Axis {
  const axis = { key: 'seismic' as const, label: 'Sismicité' };
  if (seismic === 'unavailable') return { ...axis, state: UNAVAILABLE, severity: 'unknown', detail: null };
  if (seismic === null || !SEISMIC_LABELS[seismic]) return { ...axis, state: 'Zone inconnue', severity: 'unknown', detail: null };
  const severity: Severity = seismic >= 4 ? 'high' : seismic === 3 ? 'medium' : seismic === 2 ? 'low' : 'none';
  return { ...axis, state: `Zone ${seismic} · ${SEISMIC_LABELS[seismic]}`, severity, detail: seismic >= 3 ? 'Règles parasismiques (Eurocode 8) applicables' : null };
}

/** Les quatre axes, du plus sévère au moins sévère (à égalité, dans l'ordre inondation, argiles, radon, sismicité). */
export function riskAxes(input: AxesInput): Axis[] {
  const axes = [floodAxis(input), clayAxis(input), radonAxis(input), seismicAxis(input)];
  return axes.map((a, i) => [a, i] as const).sort(([a, i], [b, j]) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || i - j).map(([a]) => a);
}

/** Modèles de PPR inondation, submersion, ruissellement (`PPRN-I`, `PPRN-L`, `PPRN-S`…) ou libellé explicite. */
export function isFloodPlan(plan: { model: string | null; label: string }): boolean {
  return /-(I|L|S)\b/i.test(plan.model ?? '') || /inond|submersion/i.test(plan.label);
}

/** Statistiques d'altitudes, en m NGF, `null` sans point (la moyenne à 0 m reste une moyenne). */
export function elevationStats(zs: readonly number[]): { min: number; max: number; mean: number; range: number } | null {
  if (zs.length === 0) return null;
  const min = Math.min(...zs);
  const max = Math.max(...zs);
  const round = (v: number) => Math.round(v * 100) / 100;
  return { min: round(min), max: round(max), mean: round(zs.reduce((t, z) => t + z, 0) / zs.length), range: round(max - min) };
}

/** Les bornes d'une case de la grille se rechargent au bout de 30 jours (OpenStreetMap bouge lentement). */
export const HYDRANTS_FRESHNESS_DAYS = 30;

/** Clé d'une case de la grille : son coin sud-ouest, « 2.42,48.79 ». */
export function cellKey([w, s]: readonly number[]): string {
  return `${w!.toFixed(2)},${s!.toFixed(2)}`;
}

/** Rayon de recherche des bornes incendie autour de l'emprise, indicatif (F-04, Q7). */
export const HYDRANT_RADIUS_M = 400;
/** Rayon de recherche des cavités, installations et sols pollués autour de l'emprise (F-04, Q10, arbitré le 02/10/2026). */
export const NEARBY_RADIUS_M = 500;

/** Coût de construction de référence, en € HT par m² de surface de plancher (valeur par défaut de l'ancien outil, ajustable en L7). */
export const REFERENCE_CONSTRUCTION_COST_M2 = 1_800;

export interface Surcharge {
  key: 'flood' | 'radon' | 'seismic';
  label: string;
  /** € HT par m² de surface de plancher. */
  perM2: number;
  /** Ce qui déclenche le surcoût. */
  basis: string;
  source: string;
  /** Faux : valeur reprise sans source vérifiable, à confirmer. */
  sourced: boolean;
}

/**
 * Surcoûts indicatifs de construction liés aux risques (F-04, Q9, arbitré le 02/10/2026), repris de
 * l'ancienne Faisabilité (`Faisabilite.tsx:448-460`, `docs/audit-follow-ups.md:20-27` @2a7f9a0) et
 * corrigés : l'inondation se déclenche sur le résultat **parcellaire** (cartes TRI), plus sur la seule
 * existence d'un PPR dans la commune.
 */
export function riskSurcharges(input: Pick<AxesInput, 'floodHazard' | 'radon' | 'seismic'>, constructionCostM2 = REFERENCE_CONSTRUCTION_COST_M2): Surcharge[] {
  const out: Surcharge[] = [];
  const { floodHazard: flood, radon, seismic } = input;
  if (flood !== 'unavailable' && flood !== null) {
    out.push({
      key: 'flood',
      label: 'Adaptation à l’inondation (fondations, plancher surélevé)',
      perM2: 150,
      basis: `Parcelle en zone inondable (TRI), aléa ${flood}`,
      source: 'Forfait repris de l’ancien outil, sans source vérifiable : à confirmer',
      sourced: false,
    });
  }
  if (radon !== 'unavailable' && radon !== null && radon >= 3) {
    out.push({
      key: 'radon',
      label: 'Protection contre le radon (membrane, ventilation)',
      perM2: 15,
      basis: `Potentiel radon de classe ${radon}`,
      source: 'Prix CYPE 12,71 à 17,11 €/m² ; fourchette ASNR et CSTB 10 à 20 €/m²',
      sourced: true,
    });
  }
  if (seismic !== 'unavailable' && seismic !== null && seismic >= 3) {
    const rate = seismic >= 4 ? 0.03 : 0.015;
    out.push({
      key: 'seismic',
      label: 'Dispositions parasismiques',
      perM2: Math.round(constructionCostM2 * rate),
      basis: `Zone de sismicité ${seismic} : ${(rate * 100).toLocaleString('fr-FR')} % du coût de construction (${constructionCostM2.toLocaleString('fr-FR')} €/m² de référence)`,
      source: 'Eurocode 8, guide CPMI-EC8 : valeurs médianes des sources professionnelles (0,5 à 4 %)',
      sourced: true,
    });
  }
  return out;
}

/** Points d'altitude par parcelle (le point intérieur, puis le périmètre tous les 15 m), et en tout. */
export const ELEVATION_PER_PARCEL = 40;
export const ELEVATION_TOTAL = 300;
const PERIMETER_STEP_M = 15;

/**
 * Points où mesurer l'altitude de chaque parcelle : un point intérieur, puis le contour tous les
 * 15 m, en partageant le plafond total entre les parcelles. Le même échantillon sert à l'analyse des
 * risques et au résumé de la carte (mêmes requêtes, donc mêmes réponses en cache).
 */
export function elevationSamples(parcels: readonly Surface[]): Position[][] {
  const perParcel = Math.min(ELEVATION_PER_PARCEL, Math.max(2, Math.floor(ELEVATION_TOTAL / Math.max(1, parcels.length))));
  return parcels.map((g) => [interiorPoint(g), ...perimeterPoints(g, PERIMETER_STEP_M, ELEVATION_PER_PARCEL - 1)].slice(0, perParcel));
}
