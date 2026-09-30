// Sélection de parcelles (F-01) : contiguïté, plafond, morceaux, surfaces. Partagé par le front
// (réponse immédiate au clic) et le back (contrôle à l'enregistrement de l'étude, L2).
import { areaM2, distanceM, type Surface } from './geometry.ts';

/** Plafond de sélection (F-01, Q5). */
export const SELECTION_MAX = 50;
/** Deux parcelles se touchent à moins d'un mètre (imprécisions du plan cadastral, F-01). */
export const CONTIGUITY_TOLERANCE_M = 1;

export interface SelectableParcel {
  id: string;
  geometry: Surface;
  /** Contenance cadastrale en m², parfois absente. */
  contenance: number | null;
}

export type AddRefusal = 'limit-reached' | 'not-contiguous';

export const REFUSAL_MESSAGES: Record<AddRefusal, string> = {
  'limit-reached': `Une sélection compte au plus ${SELECTION_MAX} parcelles.`,
  'not-contiguous': 'La parcelle doit toucher la sélection.',
};

export function touches(a: SelectableParcel, b: SelectableParcel): boolean {
  return distanceM(a.geometry, b.geometry, CONTIGUITY_TOLERANCE_M) <= CONTIGUITY_TOLERANCE_M;
}

/** Pourquoi la parcelle ne peut pas rejoindre la sélection, ou `null` si elle le peut. */
export function addRefusal(selection: readonly SelectableParcel[], candidate: SelectableParcel): AddRefusal | null {
  if (selection.length >= SELECTION_MAX) return 'limit-reached';
  if (selection.length > 0 && !selection.some((p) => touches(p, candidate))) return 'not-contiguous';
  return null;
}

export type ToggleResult<P extends SelectableParcel> =
  | { action: 'added' | 'removed'; selection: P[] }
  | { action: 'refused'; refusal: AddRefusal; selection: P[] };

/** Clic sur une parcelle : la retire si elle est sélectionnée (toujours permis), l'ajoute sinon. */
export function toggle<P extends SelectableParcel>(selection: readonly P[], candidate: P): ToggleResult<P> {
  if (selection.some((p) => p.id === candidate.id)) {
    return { action: 'removed', selection: selection.filter((p) => p.id !== candidate.id) };
  }
  const refusal = addRefusal(selection, candidate);
  if (refusal) return { action: 'refused', refusal, selection: [...selection] };
  return { action: 'added', selection: [...selection, candidate] };
}

/** Nombre de morceaux d'un seul tenant (composantes connexes de « se touchent »). */
export function pieces(selection: readonly SelectableParcel[]): number {
  const parent = selection.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < selection.length; i++) {
    for (let j = i + 1; j < selection.length; j++) {
      if (find(i) !== find(j) && touches(selection[i]!, selection[j]!)) parent[find(i)] = find(j);
    }
  }
  return new Set(selection.map((_, i) => find(i))).size;
}

export interface SelectionSummary {
  count: number;
  /** Somme des contenances connues, en m². */
  contenance: number;
  /** Parcelles sans contenance (exclues de la somme). */
  withoutContenance: number;
  /** Somme des surfaces calculées, en m². */
  area: number;
  pieces: number;
}

export function summarize(selection: readonly SelectableParcel[]): SelectionSummary {
  return {
    count: selection.length,
    contenance: selection.reduce((t, p) => t + (p.contenance ?? 0), 0),
    withoutContenance: selection.filter((p) => p.contenance === null).length,
    area: selection.reduce((t, p) => t + areaM2(p.geometry), 0),
    pieces: pieces(selection),
  };
}

const m2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const ha = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `850 m²` jusqu'à 1 ha, `1,25 ha` au-delà (F-01, #16). */
export function formatArea(squareMeters: number): string {
  return squareMeters < 10_000 ? `${m2.format(Math.round(squareMeters))} m²` : `${ha.format(squareMeters / 10_000)} ha`;
}
