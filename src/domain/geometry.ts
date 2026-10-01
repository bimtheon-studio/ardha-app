// Géométrie des parcelles, en WGS84 (longitude, latitude en degrés), sans bibliothèque : aire
// géodésique, emprises, distance entre bords. Précision visée : celle du plan cadastral, à l'échelle
// d'une parcelle ou d'un îlot (quelques centaines de mètres).

export type Position = readonly number[];
export type Ring = readonly Position[];

export interface Polygon {
  type: 'Polygon';
  coordinates: readonly Ring[];
}

export interface MultiPolygon {
  type: 'MultiPolygon';
  coordinates: readonly (readonly Ring[])[];
}

export type Surface = Polygon | MultiPolygon;

/** Emprise `[ouest, sud, est, nord]`, en degrés. */
export type Bbox = readonly [number, number, number, number];

const A = 6_378_137; // demi-grand axe de l'ellipsoïde GRS80 / WGS84
const E2 = 0.006_694_380_022_9; // excentricité au carré
const RAD = Math.PI / 180;

/** Rayons de courbure méridien (M) et transverse (N) à une latitude. */
function radii(latitude: number): { m: number; n: number } {
  const s = Math.sin(latitude * RAD);
  const w = 1 - E2 * s * s;
  return { m: (A * (1 - E2)) / w ** 1.5, n: A / Math.sqrt(w) };
}

export function polygonsOf(g: Surface): readonly (readonly Ring[])[] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

export function bboxOf(g: Surface): Bbox {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const polygon of polygonsOf(g)) {
    for (const [x = 0, y = 0] of polygon[0] ?? []) {
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      n = Math.max(n, y);
    }
  }
  return [w, s, e, n];
}

export function unionBbox(boxes: readonly Bbox[]): Bbox | null {
  if (boxes.length === 0) return null;
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

/**
 * Aire d'un anneau sur la sphère osculatrice à sa latitude (excès sphérique, formule de Chamberlain
 * et Duquette) : exacte à 10⁻⁶ près à l'échelle d'une parcelle.
 */
function ringArea(ring: Ring, radius: number): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1 = 0, y1 = 0] = ring[i]!;
    const [x2 = 0, y2 = 0] = ring[i + 1]!;
    sum += (x2 - x1) * RAD * (2 + Math.sin(y1 * RAD) + Math.sin(y2 * RAD));
  }
  return Math.abs((sum * radius * radius) / 2);
}

/** Aire en m², trous déduits. */
export function areaM2(g: Surface): number {
  const [, s, , n] = bboxOf(g);
  const { m, n: nn } = radii((s + n) / 2);
  const radius = Math.sqrt(m * nn);
  let total = 0;
  for (const [outer, ...holes] of polygonsOf(g)) {
    if (!outer) continue;
    total += ringArea(outer, radius) - holes.reduce((t, h) => t + ringArea(h, radius), 0);
  }
  return total;
}

type Point = readonly [number, number];

/** Projection plane locale en mètres autour d'une latitude et d'une longitude d'origine. */
function projector(lon0: number, lat0: number): (p: Position) => Point {
  const { m, n } = radii(lat0);
  const kx = n * Math.cos(lat0 * RAD) * RAD;
  const ky = m * RAD;
  return ([x = 0, y = 0]) => [(x - lon0) * kx, (y - lat0) * ky];
}

function segmentPointDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(
    segmentPointDistance(a, c, d),
    segmentPointDistance(b, c, d),
    segmentPointDistance(c, a, b),
    segmentPointDistance(d, a, b),
  );
}

function inRing(p: Point, ring: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(p: Point, rings: readonly (readonly Point[])[]): boolean {
  const [outer, ...holes] = rings;
  return !!outer && inRing(p, outer) && !holes.some((h) => inRing(p, h));
}

/** Point `[lon, lat]` dans la surface (bords exclus, trous exclus). */
export function containsPoint(g: Surface, position: Position): boolean {
  const [lon = 0, lat = 0] = position;
  const project = projector(lon, lat);
  return polygonsOf(g).some((rings) => inPolygon([0, 0], rings.map((r) => r.map(project))));
}

/** Distance en mètres d'un point `[lon, lat]` à la surface : 0 dedans, sinon au bord le plus proche. */
export function distanceToPointM(g: Surface, position: Position): number {
  const [lon = 0, lat = 0] = position;
  const project = projector(lon, lat);
  const polygons = polygonsOf(g).map((rings) => rings.map((r) => r.map(project)));
  if (polygons.some((rings) => inPolygon([0, 0], rings))) return 0;
  let best = Infinity;
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) best = Math.min(best, segmentPointDistance([0, 0], ring[i]!, ring[i + 1]!));
    }
  }
  return best;
}

/** Emprise élargie de `meters` mètres de chaque côté. */
export function expandBbox(b: Bbox, meters: number): Bbox {
  const { m, n } = radii((b[1] + b[3]) / 2);
  const dLat = meters / (m * RAD);
  const dLon = meters / (n * Math.cos(((b[1] + b[3]) / 2) * RAD) * RAD);
  return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat];
}

function bboxesMeet(a: Bbox, b: Bbox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/**
 * Distance en mètres entre deux surfaces : 0 si elles se recouvrent ou se croisent, sinon la plus
 * courte distance entre leurs bords. `Infinity` dès que leurs emprises, élargies de `within`
 * mètres, sont disjointes (réponse rapide à « se touchent-elles ? »).
 */
export function distanceM(a: Surface, b: Surface, within = Infinity): number {
  const ba = bboxOf(a);
  const bb = bboxOf(b);
  if (Number.isFinite(within) && !bboxesMeet(expandBbox(ba, within), bb)) return Infinity;
  const project = projector((ba[0] + ba[2]) / 2, (ba[1] + ba[3]) / 2);
  const pa = polygonsOf(a).map((rings) => rings.map((r) => r.map(project)));
  const pb = polygonsOf(b).map((rings) => rings.map((r) => r.map(project)));
  for (const [ra, rb] of [[pa, pb], [pb, pa]] as const) {
    for (const rings of ra) {
      const vertex = rings[0]?.[0];
      if (vertex && rb.some((other) => inPolygon(vertex, other))) return 0;
    }
  }
  let best = Infinity;
  for (const ringsA of pa) {
    for (const ringA of ringsA) {
      for (const ringsB of pb) {
        for (const ringB of ringsB) {
          for (let i = 0; i < ringA.length - 1; i++) {
            for (let j = 0; j < ringB.length - 1; j++) {
              best = Math.min(best, segmentDistance(ringA[i]!, ringA[i + 1]!, ringB[j]!, ringB[j + 1]!));
              if (best === 0) return 0;
            }
          }
        }
      }
    }
  }
  return best;
}

/** Distance en mètres entre deux points `[lon, lat]` (projection locale, juste à l'échelle d'une commune). */
export function pointDistanceM(a: Position, b: Position): number {
  const project = projector(a[0]!, a[1]!);
  const [x, y] = project(b);
  return Math.hypot(x, y);
}

function largestPolygon(g: Surface): readonly Ring[] {
  let best: readonly Ring[] = [];
  let bestArea = -1;
  for (const rings of polygonsOf(g)) {
    const a = areaM2({ type: 'Polygon', coordinates: rings as Position[][] });
    if (a > bestArea) [best, bestArea] = [rings, a];
  }
  return best;
}

/**
 * Un point à l'intérieur de la surface (pas forcément son centre) : le centre de sa boîte s'il est
 * dedans, sinon le milieu du plus large segment intérieur d'une ligne horizontale (à mi-hauteur, puis
 * au quart et aux trois quarts). Sert à interroger une couche en un point qui est bien sur la parcelle.
 */
export function interiorPoint(g: Surface): Position {
  const rings = largestPolygon(g);
  const [w, s, e, n] = bboxOf({ type: 'Polygon', coordinates: rings as Position[][] });
  const center: Position = [(w + e) / 2, (s + n) / 2];
  if (containsPoint(g, center)) return center;
  for (const f of [0.5, 0.25, 0.75, 0.125, 0.875]) {
    const lat = s + (n - s) * f;
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i]! as [number, number];
        const [x2, y2] = ring[i + 1]! as [number, number];
        if (y1 > lat !== y2 > lat) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    let best: Position | null = null;
    let width = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const candidate: Position = [(xs[i]! + xs[i + 1]!) / 2, lat];
      if (xs[i + 1]! - xs[i]! > width && containsPoint(g, candidate)) [best, width] = [candidate, xs[i + 1]! - xs[i]!];
    }
    if (best) return best;
  }
  return center;
}

/** Points le long des contours extérieurs, tous les `stepM` mètres environ, `max` au plus (sommets compris). */
export function perimeterPoints(g: Surface, stepM: number, max: number): Position[] {
  const points: Position[] = [];
  for (const [outer = []] of polygonsOf(g)) {
    for (let i = 0; i < outer.length - 1; i++) {
      const a = outer[i]!;
      const b = outer[i + 1]!;
      const parts = Math.max(1, Math.ceil(pointDistanceM(a, b) / stepM));
      for (let k = 0; k < parts; k++) {
        const t = k / parts;
        points.push([a[0]! + t * (b[0]! - a[0]!), a[1]! + t * (b[1]! - a[1]!)]);
      }
    }
  }
  if (points.length <= max) return points;
  // Décimation régulière : on garde des points répartis sur tout le contour.
  return Array.from({ length: max }, (_, i) => points[Math.floor((i * points.length) / max)]!);
}
