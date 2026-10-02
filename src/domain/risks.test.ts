import { describe, expect, it } from 'vitest';

import { rect } from './geometry.test.ts';
import {
  type AxesInput,
  cavityProbes,
  cellKey,
  clayLevel,
  elevationSamples,
  elevationStats,
  type FloodHit,
  floodClassLabel,
  floodHazard,
  floodScenarios,
  hydrantCells,
  isFloodPlan,
  referenceFloodHeight,
  riskAxes,
  riskSurcharges,
  worstLevel,
} from './risks.ts';

const hit = (scenario: FloodHit['scenario'], heightMax = 1, type: FloodHit['type'] = '01'): FloodHit => ({ type, scenario, heightMin: 0, heightMax });

describe('inondation (cartes TRI)', () => {
  // Repris de l'ancien `usePPRIFloodZone.test.ts` (@2a7f9a0).
  it('aléa : fort dès le fréquent, moyen au centennal, faible à l’extrême seul, rien hors zone', () => {
    expect(floodHazard([hit('01FOR'), hit('02MOY'), hit('04FAI')])).toBe('fort');
    expect(floodHazard([hit('02MOY'), hit('04FAI')])).toBe('moyen');
    expect(floodHazard([hit('03MCC', 1, '03')])).toBe('moyen');
    expect(floodHazard([hit('04FAI')])).toBe('faible');
    expect(floodHazard([])).toBeNull();
  });

  it('un résultat par type et scénario, la classe la plus haute ; hauteur de référence au scénario moyen', () => {
    const hits = [hit('02MOY', 1), hit('02MOY', 4), hit('02MOY', 2), hit('01FOR', 3), hit('04FAI', 10), hit('03MCC', 2, '03')];
    expect(floodScenarios(hits).map((h) => [h.type, h.scenario, h.heightMax])).toEqual([
      ['01', '01FOR', 3],
      ['01', '02MOY', 4],
      ['01', '04FAI', 10],
      ['03', '03MCC', 2],
    ]);
    expect(referenceFloodHeight(hits)).toEqual({ height: 4, atLeast: false });
    expect(referenceFloodHeight([hit('04FAI', 10)])).toBeNull();
  });

  it('classe ouverte « plus de 2 m » (ht_max = 10) : la hauteur de référence est « au moins 2 m »', () => {
    const open: FloodHit = { type: '01', scenario: '02MOY', heightMin: 2, heightMax: 10 };
    expect(floodClassLabel(open)).toBe('plus de 2 m');
    expect(floodClassLabel({ heightMin: 0.5, heightMax: 1 })).toBe('0,5 à 1 m');
    expect(referenceFloodHeight([open, hit('02MOY', 1)])).toEqual({ height: 2, atLeast: true });
    expect(referenceFloodHeight([open, hit('03MCC', 3, '03')])).toEqual({ height: 3, atLeast: false });
  });

  it('PPR inondation : par modèle ou par libellé', () => {
    expect(isFloodPlan({ model: 'PPRN-I', label: 'PPRI Marne et Seine' })).toBe(true);
    expect(isFloodPlan({ model: 'PPRN-L', label: 'Littoral' })).toBe(true);
    expect(isFloodPlan({ model: null, label: 'Plan de prévention des risques d’inondation' })).toBe(true);
    expect(isFloodPlan({ model: 'PPRN-Mvt', label: 'Mouvements de terrain' })).toBe(false);
    expect(isFloodPlan({ model: 'PPRT', label: 'Dépôt pétrolier' })).toBe(false);
  });
});

describe('classes', () => {
  it('argiles 1, 2, 3 ; pire niveau', () => {
    expect([clayLevel('1'), clayLevel('2'), clayLevel('3'), clayLevel(null), clayLevel('9')]).toEqual(['faible', 'moyen', 'fort', null, null]);
    expect(worstLevel(['faible', null, 'moyen'])).toBe('moyen');
    expect(worstLevel([null, null])).toBeNull();
    expect(worstLevel(['fort', 'faible'])).toBe('fort');
  });

  it('altitudes : min, max, moyenne, dénivelé ; une moyenne à 0 m reste une moyenne', () => {
    expect(elevationStats([32.35, 31.9, 32.1])).toEqual({ min: 31.9, max: 32.35, mean: 32.12, range: 0.45 });
    expect(elevationStats([0, 0])).toEqual({ min: 0, max: 0, mean: 0, range: 0 });
    expect(elevationStats([])).toBeNull();
  });
});

describe('riskAxes', () => {
  const calm: AxesInput = { floodHazard: null, floodPlan: false, clay: null, radon: 1, seismic: 1 };
  const byKey = (input: AxesInput) => Object.fromEntries(riskAxes(input).map((a) => [a.key, a]));

  it('Maisons-Alfort : TRI moyen, argiles moyen, radon 1, sismicité 1 ; trié par sévérité', () => {
    const axes = riskAxes({ floodHazard: 'moyen', floodPlan: true, clay: 'moyen', radon: 1, seismic: 1 });
    expect(axes.map((a) => [a.key, a.severity, a.state])).toEqual([
      ['flood', 'medium', 'Aléa moyen'],
      ['clay', 'medium', 'Exposition moyen'],
      ['radon', 'low', 'Classe 1 · Faible'],
      ['seismic', 'none', 'Zone 1 · Très faible'],
    ]);
    expect(axes[1]!.detail).toContain('G1');
  });

  it('inondation : TRI, sinon PPR communal, sinon hors zone ; une source muette n’est jamais « hors zone » (Q4)', () => {
    expect(byKey({ ...calm, floodHazard: 'fort' }).flood!.severity).toBe('high');
    expect(byKey({ ...calm, floodPlan: true }).flood).toMatchObject({ state: 'PPR inondation sur la commune', severity: 'medium' });
    expect(byKey(calm).flood).toMatchObject({ state: 'Hors zone inondable connue', severity: 'none' });
    expect(byKey({ ...calm, floodHazard: 'unavailable' }).flood).toMatchObject({ state: 'Source indisponible : à vérifier', severity: 'unknown' });
    expect(byKey({ ...calm, floodPlan: 'unavailable' }).flood!.severity).toBe('unknown');
    // Le TRI positif l'emporte même si les PPR n'ont pas répondu.
    expect(byKey({ ...calm, floodHazard: 'faible', floodPlan: 'unavailable' }).flood!.severity).toBe('low');
  });

  it('argiles, radon, sismicité : seuils et mentions', () => {
    expect(byKey({ ...calm, clay: 'fort' }).clay).toMatchObject({ severity: 'high' });
    expect(byKey({ ...calm, clay: 'faible' }).clay).toMatchObject({ severity: 'low', detail: null });
    expect(byKey(calm).clay).toMatchObject({ state: 'Hors zone d’exposition', severity: 'none' });
    expect(byKey({ ...calm, clay: 'unavailable' }).clay!.severity).toBe('unknown');
    expect(byKey({ ...calm, radon: 3 }).radon).toMatchObject({ severity: 'high', detail: 'Étanchéité et ventilation à prévoir au rez-de-chaussée' });
    expect(byKey({ ...calm, radon: 2 }).radon!.severity).toBe('medium');
    expect(byKey({ ...calm, radon: null }).radon!.state).toBe('Classe inconnue');
    expect(byKey({ ...calm, radon: 'unavailable' }).radon!.severity).toBe('unknown');
    expect(byKey({ ...calm, seismic: 5 }).seismic).toMatchObject({ severity: 'high', detail: 'Règles parasismiques (Eurocode 8) applicables' });
    expect(byKey({ ...calm, seismic: 3 }).seismic!.severity).toBe('medium');
    expect(byKey({ ...calm, seismic: 2 }).seismic).toMatchObject({ severity: 'low', detail: null });
    expect(byKey({ ...calm, seismic: 7 }).seismic!.state).toBe('Zone inconnue');
    expect(byKey({ ...calm, seismic: 'unavailable' }).seismic!.severity).toBe('unknown');
  });
});

describe('riskSurcharges (Q9)', () => {
  it('inondation sur le résultat parcellaire, radon classe 3, sismicité zones 3 et 4+', () => {
    expect(riskSurcharges({ floodHazard: 'moyen', radon: 3, seismic: 4 }).map((s) => [s.key, s.perM2, s.sourced])).toEqual([
      ['flood', 150, false],
      ['radon', 15, true],
      ['seismic', 54, true],
    ]);
    const [seismic] = riskSurcharges({ floodHazard: null, radon: 2, seismic: 3 });
    expect(seismic).toMatchObject({ key: 'seismic', perM2: 27 });
    // Séparateur de milliers : espace fine insécable (fr-FR).
    expect(seismic!.basis).toMatch(/^Zone de sismicité 3 : 1,5 % du coût de construction \(1\s800 €\/m² de référence\)$/);
    expect(riskSurcharges({ floodHazard: null, radon: 1, seismic: 3 }, 2_000)[0]!.perM2).toBe(30);
  });

  it('rien hors zone, ni sur une source muette', () => {
    expect(riskSurcharges({ floodHazard: null, radon: 1, seismic: 1 })).toEqual([]);
    expect(riskSurcharges({ floodHazard: 'unavailable', radon: 'unavailable', seismic: 'unavailable' })).toEqual([]);
    expect(riskSurcharges({ floodHazard: null, radon: null, seismic: null })).toEqual([]);
  });
});

describe('elevationSamples', () => {
  it('le point intérieur d’abord, puis le contour ; plafond partagé entre les parcelles', () => {
    const big = rect(2.44, 48.8, 2.442, 48.802);
    const [one] = elevationSamples([big]);
    expect(one).toHaveLength(40);
    expect(one![0]).toEqual([2.441, 48.801]);
    const many = elevationSamples(Array.from({ length: 50 }, () => big));
    expect(many.every((s) => s.length === 6)).toBe(true);
    expect(elevationSamples(Array.from({ length: 200 }, () => big))[0]).toHaveLength(2);
  });
});

describe('cellKey', () => {
  it('coin sud-ouest de la case, au centième', () => {
    expect(cellKey([2.42, 48.79, 2.43, 48.8])).toBe('2.42,48.79');
    expect(cellKey([-0.01, 43, 0, 43.01])).toBe('-0.01,43.00');
  });
});

describe('hydrantCells, cavityProbes', () => {
  it('les cases autour de chaque parcelle, sans doublon ; deux parcelles éloignées ne prennent pas tout ce qui les sépare', () => {
    const tours = rect(0.6842, 47.402, 0.6846, 47.4023);
    const annecy = rect(6.1314, 45.9161, 6.1318, 45.9165);
    const cells = hydrantCells([tours, annecy]);
    expect(cells.length).toBeLessThanOrEqual(8);
    expect(cells.map(cellKey)).toContain('0.68,47.40');
    expect(cells.map(cellKey)).toContain('6.13,45.91');
    expect(hydrantCells([tours, rect(0.6843, 47.4021, 0.6845, 47.4022)])).toHaveLength(hydrantCells([tours]).length);
  });

  it('un point de recherche des cavités par case occupée', () => {
    const a = rect(2.4297, 48.7999, 2.43, 48.8001);
    const b = rect(2.4301, 48.7999, 2.4303, 48.8001);
    expect(cavityProbes([a, a, b])).toHaveLength(2);
    expect(cavityProbes(Array.from({ length: 30 }, (_, i) => rect(2 + i * 0.02, 48, 2.001 + i * 0.02, 48.001)))).toHaveLength(20);
  });
});
