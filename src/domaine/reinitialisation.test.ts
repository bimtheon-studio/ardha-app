import { describe, expect, it } from 'vitest';

import { echeanceLien, lienUtilisable, urlLienReinitialisation } from './reinitialisation.ts';

const t0 = new Date('2026-10-01T08:00:00Z');
const HEURE = 3600 * 1000;

describe('lien de réinitialisation', () => {
  it('valable 24 heures', () => {
    const expireLe = echeanceLien(t0);
    expect(expireLe.getTime() - t0.getTime()).toBe(24 * HEURE);
    expect(lienUtilisable({ expireLe, utiliseLe: null }, new Date(t0.getTime() + 23 * HEURE))).toBe(true);
    expect(lienUtilisable({ expireLe, utiliseLe: null }, expireLe)).toBe(false);
  });

  it('à usage unique', () => {
    expect(lienUtilisable({ expireLe: echeanceLien(t0), utiliseLe: t0 }, t0)).toBe(false);
  });

  it('porte le jeton dans l’ancre, pas dans la requête', () => {
    expect(urlLienReinitialisation('http://127.0.0.1:14000/', 'ab-c_d')).toBe(
      'http://127.0.0.1:14000/reset-password#ab-c_d',
    );
  });
});
