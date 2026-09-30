import { describe, expect, it } from 'vitest';

import { decalageDeBranche, PORTS_DE_BASE, portsDecales } from './ports.ts';

describe('decalageDeBranche', () => {
  it('suit crc32(branche) % 400 + 5, comme castor.php', () => {
    // Valeur de référence calculée par PHP : crc32("master") = 755606486 ; % 400 + 5 = 91
    expect(decalageDeBranche('master')).toBe(91);
  });

  it('est déterministe et reste entre 5 et 404', () => {
    for (const branche of ['master', 'l1-carte', 'feature/x', 'HEAD', '']) {
      const d = decalageDeBranche(branche);
      expect(d).toBe(decalageDeBranche(branche));
      expect(d).toBeGreaterThanOrEqual(5);
      expect(d).toBeLessThanOrEqual(404);
    }
  });
});

describe('portsDecales', () => {
  it('ajoute le décalage à chaque port de base', () => {
    expect(portsDecales(0)).toEqual(PORTS_DE_BASE);
    expect(portsDecales(10).postgres).toBe(PORTS_DE_BASE.postgres + 10);
  });

  it('ne fait jamais se recouvrir les plages de deux services', () => {
    const bases = Object.values(PORTS_DE_BASE).sort((a, b) => a - b);
    for (let i = 1; i < bases.length; i++) {
      expect(bases[i]! - bases[i - 1]!).toBeGreaterThan(404);
    }
  });
});
