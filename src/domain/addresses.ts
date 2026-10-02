// Adresse principale d'une étude (F-02, Q3) : où sonder la BAN, quelles adresses garder, dans quel
// ordre. Repris de l'ancien `useParcelAddresses.ts` (@2a7f9a0, l. 33-236), filtre corrigé : distance
// au polygone, et non à sa boîte (B13).
import { bboxOf, distanceToPointM, type Position, type Surface } from './geometry.ts';

/** Points sondés au plus, toutes parcelles confondues (ancien code, l. 165). */
export const PROBE_MAX = 12;
/** Une adresse est rattachée à une parcelle à moins de 10 m (ancien tampon de 0,0001°). */
export const ADDRESS_TOLERANCE_M = 10;

export interface AddressCandidate {
  id: string;
  kind: 'housenumber' | 'street' | 'locality' | 'municipality';
  /** « 2 Rue Étienne Dolet ». */
  name: string;
  /** Voie, sans le numéro ; nulle pour un toponyme. */
  street: string | null;
  lon: number;
  lat: number;
  score: number;
}

/**
 * Points à sonder : le centre de chaque parcelle d'abord, puis les milieux des côtés de sa boîte
 * (sud, nord, ouest, est), à tour de rôle, jusqu'à `PROBE_MAX`.
 */
export function probePoints(parcels: readonly Surface[], max = PROBE_MAX): Position[] {
  const boxes = parcels.map(bboxOf);
  const rounds: Position[][] = [
    boxes.map(([w, s, e, n]) => [(w + e) / 2, (s + n) / 2]),
    boxes.map(([w, s, e]) => [(w + e) / 2, s]),
    boxes.map(([w, , e, n]) => [(w + e) / 2, n]),
    boxes.map(([w, s, , n]) => [w, (s + n) / 2]),
    boxes.map(([, s, e, n]) => [e, (s + n) / 2]),
  ];
  return rounds.flat().slice(0, max);
}

const HIERARCHY: readonly [RegExp, number][] = [
  [/^(boulevard|bd)\b/, 6],
  [/^(avenue|av)\b/, 5],
  [/^(route|rte)\b/, 4],
  [/^rue\b/, 3],
  [/^(chemin|che)\b/, 2],
  [/^(impasse|voie|allee|sentier|passage|quai|cours|place)\b/, 1],
];

/** Rang d'une voie : boulevard 6, avenue 5, route 4, rue 3, chemin 2, impasse, allée, quai… 1. */
export function streetRank(street: string | null): number {
  if (!street) return 0;
  const s = street.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  return HIERARCHY.find(([re]) => re.test(s))?.[1] ?? 0;
}

function houseNumber(a: AddressCandidate): number {
  if (a.kind !== 'housenumber') return Infinity;
  const n = Number.parseInt(a.name, 10);
  return Number.isNaN(n) ? Infinity : n;
}

/**
 * Adresses rattachées aux parcelles, dédoublonnées, la principale en tête : voie la plus importante,
 * puis plus petit numéro, puis meilleur score BAN ; une adresse avec voie passe devant un toponyme.
 */
export function rankAddresses<A extends AddressCandidate>(candidates: readonly A[], parcels: readonly Surface[], toleranceM = ADDRESS_TOLERANCE_M): A[] {
  const seen = new Set<string>();
  const kept = candidates.filter((a) => {
    if (a.kind === 'municipality' || seen.has(a.id)) return false;
    seen.add(a.id);
    return parcels.some((p) => distanceToPointM(p, [a.lon, a.lat]) <= toleranceM);
  });
  const hasStreet = (a: A) => (a.kind === 'locality' ? 1 : 0);
  return kept.sort(
    (a, b) =>
      hasStreet(a) - hasStreet(b) ||
      streetRank(b.street) - streetRank(a.street) ||
      houseNumber(a) - houseNumber(b) ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
  );
}

/** Adresse retenue : celle choisie par l'utilisateur si elle est toujours trouvée, sinon la principale. */
export function chooseAddress<A extends { id: string }>(ranked: readonly A[], chosenId: string | null): A | null {
  return (chosenId ? ranked.find((a) => a.id === chosenId) : undefined) ?? ranked[0] ?? null;
}
