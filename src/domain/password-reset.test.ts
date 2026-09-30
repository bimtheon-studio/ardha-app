import { describe, expect, it } from 'vitest';

import { linkDeadline, linkUsable, resetLinkUrl } from './password-reset.ts';

const t0 = new Date('2026-10-01T08:00:00Z');
const HOUR = 3600 * 1000;

describe('lien de réinitialisation', () => {
  it('valable 24 heures', () => {
    const expiresAt = linkDeadline(t0);
    expect(expiresAt.getTime() - t0.getTime()).toBe(24 * HOUR);
    expect(linkUsable({ expiresAt, usedAt: null }, new Date(t0.getTime() + 23 * HOUR))).toBe(true);
    expect(linkUsable({ expiresAt, usedAt: null }, expiresAt)).toBe(false);
  });

  it('à usage unique', () => {
    expect(linkUsable({ expiresAt: linkDeadline(t0), usedAt: t0 }, t0)).toBe(false);
  });

  it('porte le jeton dans l’ancre, pas dans la requête', () => {
    expect(resetLinkUrl('http://127.0.0.1:14000/', 'ab-c_d')).toBe(
      'http://127.0.0.1:14000/reset-password#ab-c_d',
    );
  });
});
