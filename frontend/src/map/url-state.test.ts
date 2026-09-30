import { describe, expect, it } from 'vitest';

import { formatView, parseParcelIds, parseView } from './url-state';

describe('état dans l’URL', () => {
  it('vue : lat,lon,zoom', () => {
    expect(parseView('48.80012,2.42993,18')).toEqual({ lat: 48.80012, lon: 2.42993, zoom: 18 });
    expect(parseView('48.8,2.4,17.6')?.zoom).toBe(18);
    for (const v of [null, '', '48.8,2.4', 'a,b,c', '91,0,5', '0,181,5', '0,0,23', '0,0,-1']) expect(parseView(v)).toBeNull();
    expect(formatView({ lat: 48.800123456, lon: 2.4, zoom: 17 })).toBe('48.80012,2.40000,17');
  });

  it('parcelles : identifiants valides, sans doublon, 50 au plus', () => {
    expect(parseParcelIds('940460000A0018,x,940460000A0018,37023000AB0001')).toEqual(['940460000A0018', '37023000AB0001']);
    expect(parseParcelIds(null)).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => `37023000AB${String(i).padStart(4, '0')}`).join(',');
    expect(parseParcelIds(many)).toHaveLength(50);
  });
});
