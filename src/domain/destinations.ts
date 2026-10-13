import { CNIG_SUB_DESTINATIONS, cnigLabel, formatCnigDestination } from './cnig.ts';
import type { SaleCategory } from './dvf.ts';

// Destination d'une étude (F-02b) : ce que le projet construira. Une liste courte, dans les mots du
// métier, chaque entrée adossée aux sous-destinations CNIG pour être confrontée un jour au zonage
// (Q1) ; « Autre » ouvre les sous-destinations qu'aucune ne couvre. Une étude en a une ou plusieurs,
// la principale en tête, sans répartition (Q2) ; Logement par défaut (Q3).

export interface StudyDestinationDef {
  key: string;
  label: string;
  /** Sous-destinations CNIG couvertes. */
  cnig: readonly string[];
}

export const STUDY_DESTINATIONS: readonly StudyDestinationDef[] = [
  { key: 'housing', label: 'Logement', cnig: ['21'] },
  { key: 'managed-residence', label: 'Résidence gérée', cnig: ['22'] },
  { key: 'retail', label: 'Commerce et services', cnig: ['31', '32', '34'] },
  { key: 'office', label: 'Bureaux', cnig: ['53'] },
  { key: 'hotel', label: 'Hôtellerie', cnig: ['35', '36'] },
  { key: 'industrial', label: 'Activités et entrepôts', cnig: ['51', '52'] },
  { key: 'public-facility', label: 'Équipement', cnig: ['41', '42', '43', '44', '45', '46', '47'] },
];

export const DEFAULT_DESTINATIONS: readonly string[] = ['housing'];

const BY_KEY = new Map(STUDY_DESTINATIONS.map((d) => [d.key, d]));
const BY_CNIG = new Map(STUDY_DESTINATIONS.flatMap((d) => d.cnig.map((c) => [c, d.key] as const)));

/** Sous-destinations qu'aucune destination produit ne couvre : le reste de « Autre ». */
export const OTHER_DESTINATIONS: readonly string[] = CNIG_SUB_DESTINATIONS.filter((c) => !BY_CNIG.has(c));

/** Une clé produit, ou une sous-destination CNIG (couverte ou non). */
export function isStudyDestination(value: string): boolean {
  return BY_KEY.has(value) || CNIG_SUB_DESTINATIONS.includes(value);
}

export function destinationLabel(value: string): string {
  return BY_KEY.get(value)?.label ?? cnigLabel(value) ?? formatCnigDestination({ code: value, label: null });
}

export function destinationCnigCodes(value: string): readonly string[] {
  return BY_KEY.get(value)?.cnig ?? (CNIG_SUB_DESTINATIONS.includes(value) ? [value] : []);
}

/**
 * Destinations d'une étude, dans l'ordre (la principale en tête) : une sous-destination couverte
 * devient sa clé produit (« 31 » → `retail`), sans doublon. Refuse le vide et l'inconnu.
 */
export function normalizeDestinations(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().toLowerCase();
    if (!isStudyDestination(value)) throw new Error(`Destination inconnue : ${raw.trim()}.`);
    const key = BY_CNIG.get(value) ?? value;
    if (!out.includes(key)) out.push(key);
  }
  if (out.length === 0) throw new Error('Choisissez au moins une destination.');
  return out;
}

/** « Commerce et services (principale), Bureaux » ; une seule : son libellé. */
export function describeDestinations(values: readonly string[]): string {
  const labels = values.map(destinationLabel);
  return labels.length > 1 ? [`${labels[0]} (principale)`, ...labels.slice(1)].join(', ') : (labels[0] ?? '');
}

/** La principale, et le nombre des autres : « Commerce et services (+1) ». */
export function mainDestination(values: readonly string[]): string {
  if (values.length === 0) return '';
  return `${destinationLabel(values[0]!)}${values.length > 1 ? ` (+${values.length - 1})` : ''}`;
}

/** Destinations dont DVF a un prix : celui des locaux d'activité, qu'il ne distingue pas. */
const ACTIVITY: readonly string[] = ['retail', 'office', 'industrial', '33', '54', '55'];
const HOUSING_ORDER: readonly SaleCategory[] = ['apartment', 'house', 'commercial', 'land'];

export interface MarketFocus {
  /** Ordre des cartes de prix. */
  categories: SaleCategory[];
  /** Ce que les prix ne disent pas de la destination principale. */
  notice: string | null;
}

/** Ce que la destination principale change à la page Foncier et marché (Q8). */
export function marketFocus(destinations: readonly string[]): MarketFocus {
  const main = destinations[0] ?? 'housing';
  if (main === 'housing') return { categories: [...HOUSING_ORDER], notice: null };
  if (ACTIVITY.includes(main)) {
    return {
      categories: ['commercial', 'apartment', 'house', 'land'],
      notice: 'DVF ne distingue pas commerces, bureaux et locaux d’activité : un seul prix, celui des locaux d’activité.',
    };
  }
  return {
    categories: [...HOUSING_ORDER],
    notice: `DVF n’a pas de prix pour « ${destinationLabel(main)} » : les prix affichés sont ceux des logements et des locaux d’activité.`,
  };
}
