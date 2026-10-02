import { departmentOf } from './commune.ts';

// Ventes DVF (F-05) : dédoublonnage des lignes geo-DVF, classement des ventes comparables, bornes de
// prix. Repris de l'ancien `_shared/dvf.ts:76-139,347-434` @2a7f9a0, avec les ventes retenues
// arbitrées en F-05 Q3 : ventes et VEFA seulement, une seule maison ou un seul appartement, terrain
// au m² de terrain.

/** Départements que DVF ne couvre pas (livre foncier en Alsace-Moselle, Mayotte non publié). */
export const DVF_EXCLUDED_DEPARTMENTS: readonly string[] = ['57', '67', '68', '976'];

export function isDvfCovered(communeCode: string): boolean {
  return !DVF_EXCLUDED_DEPARTMENTS.includes(departmentOf(communeCode));
}

/** Une ligne de geo-DVF : une disposition × parcelle × local × nature de culture. */
export interface DvfRow {
  mutationId: string;
  /** `AAAA-MM-JJ`. */
  date: string;
  nature: string;
  /** Valeur foncière de toute la mutation, répétée sur chaque ligne ; nulle si absente. */
  price: number | null;
  streetNumber: string;
  streetSuffix: string;
  streetName: string;
  postcode: string;
  communeCode: string;
  parcelId: string;
  /** `Maison`, `Appartement`, `Dépendance`, `Local industriel. commercial ou assimilé`, ou vide. */
  localType: string;
  builtArea: number | null;
  rooms: number | null;
  /** Code de nature de culture (`S` sols, `J` jardins, `AB` terrains à bâtir…), ou vide. */
  cultureCode: string;
  landArea: number | null;
  lon: number | null;
  lat: number | null;
}

export type PropertyType = 'house' | 'apartment' | 'commercial' | 'outbuilding' | 'land' | 'other';

export interface DvfLocal {
  type: Exclude<PropertyType, 'land' | 'other'>;
  area: number | null;
  rooms: number | null;
}

/** Une mutation dédoublonnée : une vente. */
export interface DvfMutation {
  id: string;
  date: string;
  nature: string;
  vefa: boolean;
  price: number;
  propertyType: PropertyType;
  /** Maisons et appartements vendus ensemble. */
  dwellingCount: number;
  /** Surface bâtie des logements (maisons, appartements), en m². */
  builtArea: number | null;
  landArea: number | null;
  /** Pièces principales, s'il n'y a qu'un logement. */
  rooms: number | null;
  communeCode: string;
  parcelIds: string[];
  address: string | null;
  postcode: string | null;
  /** `[longitude, latitude]`. */
  position: [number, number] | null;
  locals: DvfLocal[];
  /** Natures de culture du terrain, sans doublon. */
  cultures: string[];
}

const LOCAL_TYPES: Record<string, DvfLocal['type']> = {
  Maison: 'house',
  Appartement: 'apartment',
  Dépendance: 'outbuilding',
  'Local industriel. commercial ou assimilé': 'commercial',
};

/** Ordre du type dominant : un logement d'abord. */
const TYPE_PRIORITY: readonly DvfLocal['type'][] = ['house', 'apartment', 'commercial', 'outbuilding'];

const normalized = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, ' ');

/** « Vente en l'état futur d'achèvement », quelle que soit la casse ou l'apostrophe. */
export function isVefaNature(nature: string): boolean {
  return normalized(nature).includes('etat futur');
}

/** Natures retenues pour les prix (Q3) : adjudications, échanges, expropriations exclues. */
export function isComparableNature(nature: string): boolean {
  const n = normalized(nature).trim();
  return n === 'vente' || n === 'vente terrain a batir' || isVefaNature(nature);
}

/**
 * Une vente par `id_mutation`. geo-DVF répète la valeur foncière sur chaque ligne : sans ce
 * regroupement, une vente en plusieurs lots compte plusieurs fois. Un local se répète par nature de
 * culture de sa parcelle ; un terrain par (parcelle, culture, surface).
 */
export function dedupMutations(rows: readonly DvfRow[]): DvfMutation[] {
  const groups = new Map<string, DvfRow[]>();
  for (const r of rows) {
    const key = r.mutationId || `${r.date}|${r.price}|${r.parcelId}`;
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  const out: DvfMutation[] = [];
  for (const [key, group] of groups) {
    const first = group[0]!;
    if (!first.price || first.price <= 0) continue;
    const localKeys = new Set<string>();
    const locals: (DvfLocal & { row: DvfRow })[] = [];
    for (const r of group) {
      const type = LOCAL_TYPES[r.localType];
      if (!type) continue;
      const k = `${r.parcelId}|${r.localType}|${r.builtArea}|${r.rooms}`;
      if (localKeys.has(k)) continue;
      localKeys.add(k);
      locals.push({ type, area: r.builtArea, rooms: r.rooms, row: r });
    }
    const landKeys = new Set<string>();
    let landArea = 0;
    const cultures = new Set<string>();
    for (const r of group) {
      if (r.cultureCode) cultures.add(r.cultureCode);
      if (!r.landArea) continue;
      const k = `${r.parcelId}|${r.cultureCode}|${r.landArea}`;
      if (landKeys.has(k)) continue;
      landKeys.add(k);
      landArea += r.landArea;
    }
    const dwellings = locals.filter((l) => l.type === 'house' || l.type === 'apartment');
    const builtArea = dwellings.reduce((s, l) => s + (l.area ?? 0), 0);
    const propertyType: PropertyType =
      locals.length > 0 ? TYPE_PRIORITY.find((t) => locals.some((l) => l.type === t))! : landArea > 0 ? 'land' : 'other';
    const located = group.find((r) => r.lon !== null && r.lat !== null);
    const addressed = locals.find((l) => l.row.streetName)?.row ?? group.find((r) => r.streetName);
    out.push({
      id: first.mutationId || key,
      date: first.date,
      nature: first.nature,
      vefa: isVefaNature(first.nature),
      price: first.price,
      propertyType,
      dwellingCount: dwellings.length,
      builtArea: builtArea > 0 ? builtArea : null,
      landArea: landArea > 0 ? landArea : null,
      rooms: dwellings.length === 1 ? dwellings[0]!.rooms : null,
      communeCode: first.communeCode,
      parcelIds: [...new Set(group.map((r) => r.parcelId).filter(Boolean))],
      address: addressed
        ? [addressed.streetNumber + addressed.streetSuffix, addressed.streetName].filter(Boolean).join(' ')
        : null,
      postcode: first.postcode || null,
      position: located ? [located.lon!, located.lat!] : null,
      locals: locals.map(({ type, area, rooms }) => ({ type, area, rooms })),
      cultures: [...cultures].sort(),
    });
  }
  return out;
}

export type SaleCategory = 'house' | 'apartment' | 'land';
/** Ancien, ou neuf vendu en VEFA. */
export type SaleSegment = 'existing' | 'new';

export const SALE_CATEGORIES: readonly SaleCategory[] = ['house', 'apartment', 'land'];
export const SALE_SEGMENTS: readonly SaleSegment[] = ['existing', 'new'];

/** Valeur foncière minimale : en dessous, une cession symbolique. */
export const MIN_SALE_PRICE = 5000;
/** Surface bâtie minimale : en dessous, une cave ou un parking. */
export const MIN_BUILT_AREA = 9;

/** Bornes du prix au m² (bâti pour les logements, terrain pour le terrain). */
export const PRICE_M2_BOUNDS: Record<SaleCategory, { min: number; max: number }> = {
  apartment: { min: 500, max: 25_000 },
  house: { min: 500, max: 20_000 },
  land: { min: 1, max: 20_000 },
};

/**
 * Natures de culture d'un terrain urbain : terrains à bâtir, sols, jardins, terrains d'agrément.
 * Une vente de prés, de bois ou de terres agricoles ne dit rien du prix d'un terrain à bâtir.
 */
export const URBAN_LAND_CULTURES: readonly string[] = ['AB', 'S', 'J', 'AG'];

export interface ComparableSale {
  category: SaleCategory;
  segment: SaleSegment;
  /** Prix au m² de bâti (maison, appartement) ou de terrain. */
  pricePerM2: number;
}

/**
 * Ce que la vente apporte aux prix (Q3), ou `null` : une seule maison ou un seul appartement
 * (dépendances admises, pas de local d'activité), ou un terrain urbain sans aucun local.
 */
export function comparableOf(m: Pick<DvfMutation, 'nature' | 'vefa' | 'price' | 'locals' | 'dwellingCount' | 'builtArea' | 'landArea' | 'cultures'>): ComparableSale | null {
  if (!isComparableNature(m.nature) || m.price < MIN_SALE_PRICE) return null;
  let category: SaleCategory;
  let area: number | null;
  if (m.locals.length === 0) {
    if (m.vefa || !m.cultures.some((c) => URBAN_LAND_CULTURES.includes(c))) return null;
    category = 'land';
    area = m.landArea;
  } else {
    const dwelling = m.locals.find((l) => l.type === 'house' || l.type === 'apartment');
    if (m.dwellingCount !== 1 || !dwelling || m.locals.some((l) => l.type === 'commercial')) return null;
    if (m.builtArea === null || m.builtArea < MIN_BUILT_AREA) return null;
    category = dwelling.type as SaleCategory;
    area = m.builtArea;
  }
  if (!area) return null;
  const pricePerM2 = Math.round(m.price / area);
  const bounds = PRICE_M2_BOUNDS[category];
  if (pricePerM2 < bounds.min || pricePerM2 > bounds.max) return null;
  return { category, segment: m.vefa ? 'new' : 'existing', pricePerM2 };
}
