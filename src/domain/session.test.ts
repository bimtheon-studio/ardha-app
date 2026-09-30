import { describe, expect, it } from 'vitest';

import {
  DUREE_GLISSANTE_MS,
  DUREE_MAX_MS,
  dureeCookieMs,
  echeancesInitiales,
  INTERVALLE_PROLONGATION_MS,
  prolongation,
  sessionExpiree,
} from './session.ts';

const t0 = new Date('2026-10-01T08:00:00Z');
const plus = (ms: number) => new Date(t0.getTime() + ms);
const JOUR = 24 * 3600 * 1000;

describe('echeancesInitiales', () => {
  it('30 jours glissants, 90 jours au plus', () => {
    const e = echeancesInitiales(t0);
    expect(e.expireLe).toEqual(plus(30 * JOUR));
    expect(e.expireAuPlusTardLe).toEqual(plus(90 * JOUR));
  });
});

describe('sessionExpiree', () => {
  const e = echeancesInitiales(t0);
  it('vivante avant l’échéance glissante', () => {
    expect(sessionExpiree(e, plus(DUREE_GLISSANTE_MS - 1))).toBe(false);
  });
  it('expirée à l’échéance glissante', () => {
    expect(sessionExpiree(e, plus(DUREE_GLISSANTE_MS))).toBe(true);
  });
  it('expirée à l’échéance absolue, même prolongée', () => {
    expect(sessionExpiree({ ...e, expireLe: plus(100 * JOUR) }, plus(DUREE_MAX_MS))).toBe(true);
  });
});

describe('prolongation', () => {
  const e = { ...echeancesInitiales(t0), derniereActiviteLe: t0 };
  it('rien à écrire moins d’une heure après la dernière activité', () => {
    expect(prolongation(e, plus(INTERVALLE_PROLONGATION_MS - 1))).toBeNull();
  });
  it('repousse de 30 jours à partir de maintenant', () => {
    const maintenant = plus(10 * JOUR);
    expect(prolongation(e, maintenant)).toEqual(new Date(maintenant.getTime() + DUREE_GLISSANTE_MS));
  });
  it('jamais au-delà de 90 jours après la connexion', () => {
    expect(prolongation(e, plus(80 * JOUR))).toEqual(plus(90 * JOUR));
  });
});

describe('dureeCookieMs', () => {
  it('jusqu’à la plus proche des deux échéances, jamais négative', () => {
    const e = echeancesInitiales(t0);
    expect(dureeCookieMs(e, t0)).toBe(DUREE_GLISSANTE_MS);
    expect(dureeCookieMs({ ...e, expireLe: plus(100 * JOUR) }, t0)).toBe(DUREE_MAX_MS);
    expect(dureeCookieMs(e, plus(200 * JOUR))).toBe(0);
  });
});
