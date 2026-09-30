import { describe, expect, it } from 'vitest';

import { branchOffset, BASE_PORTS, offsetPorts } from './ports.ts';

describe('decalageDeBranche', () => {
  it('suit crc32(branche) % 400 + 5, comme castor.php', () => {
    // Valeur de référence calculée par PHP : crc32("master") = 755606486 ; % 400 + 5 = 91
    expect(branchOffset('master')).toBe(91);
  });

  it('est déterministe et reste entre 5 et 404', () => {
    for (const branch of ['master', 'l1-carte', 'feature/x', 'HEAD', '']) {
      const d = branchOffset(branch);
      expect(d).toBe(branchOffset(branch));
      expect(d).toBeGreaterThanOrEqual(5);
      expect(d).toBeLessThanOrEqual(404);
    }
  });
});

describe('portsDecales', () => {
  it('ajoute le décalage à chaque port de base', () => {
    expect(offsetPorts(0)).toEqual(BASE_PORTS);
    expect(offsetPorts(10).postgres).toBe(BASE_PORTS.postgres + 10);
  });

  it('ne fait jamais se recouvrir les plages de deux services', () => {
    const sortedBases = Object.values(BASE_PORTS).sort((a, b) => a - b);
    for (let i = 1; i < sortedBases.length; i++) {
      expect(sortedBases[i]! - sortedBases[i - 1]!).toBeGreaterThan(404);
    }
  });
});
