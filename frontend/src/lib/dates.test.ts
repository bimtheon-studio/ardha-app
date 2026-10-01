import { describe, expect, it } from 'vitest';

import { formatDate, formatRelative } from './dates';

describe('formatRelative', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('du plus récent au plus ancien', () => {
    expect(formatRelative(ago(20_000), now)).toBe('à l’instant');
    expect(formatRelative(ago(5 * 60_000), now)).toBe('il y a 5 min');
    expect(formatRelative(ago(2 * 3600_000 + 1), now)).toBe('il y a 2 h');
    expect(formatRelative(ago(3 * 86400_000), now)).toBe('il y a 3 j');
    expect(formatRelative('2026-08-15T10:00:00Z', now)).toBe('le 15 août 2026');
  });

  it('date seule, à l’heure de Paris', () => {
    expect(formatDate('2026-10-30T23:30:00Z')).toBe('31 octobre 2026');
  });
});
