import { describe, expect, it } from 'vitest';

import {
  SLIDING_DURATION_MS,
  MAX_DURATION_MS,
  cookieDurationMs,
  initialDeadlines,
  RENEWAL_INTERVAL_MS,
  renewal,
  sessionExpired,
} from './session.ts';

const t0 = new Date('2026-10-01T08:00:00Z');
const plusMs = (ms: number) => new Date(t0.getTime() + ms);
const DAY = 24 * 3600 * 1000;

describe('echeancesInitiales', () => {
  it('30 jours glissants, 90 jours au plus', () => {
    const e = initialDeadlines(t0);
    expect(e.expiresAt).toEqual(plusMs(30 * DAY));
    expect(e.absoluteExpiresAt).toEqual(plusMs(90 * DAY));
  });
});

describe('sessionExpiree', () => {
  const e = initialDeadlines(t0);
  it('vivante avant l’échéance glissante', () => {
    expect(sessionExpired(e, plusMs(SLIDING_DURATION_MS - 1))).toBe(false);
  });
  it('expirée à l’échéance glissante', () => {
    expect(sessionExpired(e, plusMs(SLIDING_DURATION_MS))).toBe(true);
  });
  it('expirée à l’échéance absolue, même prolongée', () => {
    expect(sessionExpired({ ...e, expiresAt: plusMs(100 * DAY) }, plusMs(MAX_DURATION_MS))).toBe(true);
  });
});

describe('prolongation', () => {
  const e = { ...initialDeadlines(t0), lastActivityAt: t0 };
  it('rien à écrire moins d’une heure après la dernière activité', () => {
    expect(renewal(e, plusMs(RENEWAL_INTERVAL_MS - 1))).toBeNull();
  });
  it('repousse de 30 jours à partir de maintenant', () => {
    const now = plusMs(10 * DAY);
    expect(renewal(e, now)).toEqual(new Date(now.getTime() + SLIDING_DURATION_MS));
  });
  it('jamais au-delà de 90 jours après la connexion', () => {
    expect(renewal(e, plusMs(80 * DAY))).toEqual(plusMs(90 * DAY));
  });
});

describe('dureeCookieMs', () => {
  it('jusqu’à la plus proche des deux échéances, jamais négative', () => {
    const e = initialDeadlines(t0);
    expect(cookieDurationMs(e, t0)).toBe(SLIDING_DURATION_MS);
    expect(cookieDurationMs({ ...e, expiresAt: plusMs(100 * DAY) }, t0)).toBe(MAX_DURATION_MS);
    expect(cookieDurationMs(e, plusMs(200 * DAY))).toBe(0);
  });
});
