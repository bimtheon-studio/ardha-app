// Étude (F-02) : nom proposé, empreinte des parcelles, étapes. Partagé par le front et le back.
import { parcelLabel } from './parcel-id.ts';

export const STUDY_NAME_MAX = 120;
/** Durée de séjour dans la corbeille avant la purge (F-02, Q9). */
export const TRASH_RETENTION_DAYS = 30;

/** Ce que le nommage lit d'une adresse (BAN). */
export interface NamingAddress {
  kind: 'housenumber' | 'street' | 'locality' | 'municipality';
  /** « 2 Rue Étienne Dolet », « Rue Pasteur », « Les Fourches ». */
  name: string;
  city: string;
}

export interface NamingParcel {
  prefix: string;
  section: string;
  number: string;
}

/**
 * Nom proposé à la création (F-02, Q2) : l'adresse principale, sinon la commune et la 1ʳᵉ parcelle.
 * Une voie sans numéro garde son nom (l'ancien code en faisait un « Lieu-dit », B14) ; seul un
 * toponyme devient « Lieu-dit ». Suffixe « (+N parcelles) » au-delà d'une parcelle.
 */
export function proposeStudyName(input: {
  address: NamingAddress | null;
  parcels: readonly NamingParcel[];
  communeName: string | null;
  today: Date;
}): string {
  const { address, parcels, communeName, today } = input;
  let base: string;
  if (address && (address.kind === 'housenumber' || address.kind === 'street')) base = `${address.name}, ${address.city}`;
  else if (address?.kind === 'locality') base = `Lieu-dit ${address.name}, ${address.city}`;
  else if (communeName && parcels[0]) base = `${communeName} — ${parcelLabel(parcels[0])}`;
  else if (communeName) base = communeName;
  else base = `Étude du ${today.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`;
  const others = parcels.length - 1;
  const suffix = others > 0 ? ` (+${others} parcelle${others > 1 ? 's' : ''})` : '';
  return `${base.slice(0, STUDY_NAME_MAX - suffix.length)}${suffix}`;
}

/** Commune qui porte la plus grande surface (à égalité, la première rencontrée). */
export function principalCommune(parcels: readonly { communeCode: string; area: number }[]): string | null {
  const totals = new Map<string, number>();
  for (const p of parcels) totals.set(p.communeCode, (totals.get(p.communeCode) ?? 0) + p.area);
  let best: string | null = null;
  for (const [code, area] of totals) if (best === null || area > totals.get(best)!) best = code;
  return best;
}

/** Nom d'une copie (F-02, Q10). */
export function copyName(name: string): string {
  const suffix = ' (copie)';
  return `${name.slice(0, STUDY_NAME_MAX - suffix.length)}${suffix}`;
}

/**
 * Empreinte d'un ensemble de parcelles, indépendante de l'ordre (FNV-1a sur 2 × 32 bits) : adresse
 * et vignette sont « en retard » quand leur empreinte n'est plus celle des parcelles.
 */
export function parcelsKey(ids: readonly string[]): string {
  const text = [...new Set(ids)].sort().join(',');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export type StepKey = 'parcels' | 'urbanism' | 'risks' | 'land' | 'feasibility' | 'report';
/** `upcoming` : le lot qui la livre n'est pas encore là. */
export type StepState = 'done' | 'todo' | 'upcoming';

export interface StudyStep {
  key: StepKey;
  label: string;
  state: StepState;
  /** Lot qui livre l'étape (« L3 »), tant qu'elle est à venir. */
  lot: string | null;
}

const STEPS: readonly { key: StepKey; label: string; lot: string | null }[] = [
  { key: 'parcels', label: 'Parcelles', lot: null },
  { key: 'urbanism', label: 'Urbanisme', lot: 'L3' },
  { key: 'risks', label: 'Risques', lot: 'L4' },
  { key: 'land', label: 'Foncier et marché', lot: 'L5' },
  { key: 'feasibility', label: 'Faisabilité', lot: 'L7' },
  { key: 'report', label: 'Rapport', lot: 'L8' },
];

/** Étapes de l'étude (F-02, Q4) : pas de statut saisi, chaque étape se déduit de ce qui existe. */
export function studySteps(study: { parcelCount: number }): StudyStep[] {
  return STEPS.map((s) => {
    if (s.key === 'parcels') return { ...s, state: study.parcelCount > 0 ? 'done' : 'todo', lot: null };
    return { ...s, state: 'upcoming' };
  });
}
