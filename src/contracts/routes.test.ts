import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { messagesByField, route, urlOf } from './routes.ts';

describe('messagesParChamp', () => {
  it('garde le premier message par champ, et range les erreurs globales sous « _ »', () => {
    const s = z.object({ a: z.string().min(2, 'court').max(1, 'long'), b: z.object({ c: z.number('nombre') }) }).refine(() => false, 'global');
    const r = s.safeParse({ a: 'xyz', b: { c: 'x' } });
    expect(r.success).toBe(false);
    if (!r.success) expect(messagesByField(r.error)).toEqual({ a: 'long', 'b.c': 'nombre' });
    const r2 = s.safeParse({ a: 'x', b: { c: 1 } });
    if (!r2.success) expect(messagesByField(r2.error)).toMatchObject({ a: 'court' });
    const r3 = z.string().refine(() => false, 'global').safeParse('x');
    if (!r3.success) expect(messagesByField(r3.error)).toEqual({ _: 'global' });
  });
});

describe('urlOf', () => {
  const r = route({
    method: 'GET',
    path: '/api/communes/:code/parcels/:id',
    summary: 'test',
    body: undefined,
    response: undefined,
    status: 200,
    authenticated: true,
  });

  it('substitue et encode les paramètres de chemin, puis ajoute la requête sans les valeurs absentes', () => {
    expect(urlOf(r, { code: '2A004', id: 'a/b' }, { q: '8 rue', limit: 5, empty: undefined })).toBe(
      '/api/communes/2A004/parcels/a%2Fb?q=8+rue&limit=5',
    );
    expect(urlOf({ ...r, path: '/api/health' })).toBe('/api/health');
  });

  it('refuse un paramètre de chemin manquant', () => {
    expect(() => urlOf(r, { code: '94046' })).toThrow('Paramètre manquant : id');
  });
});
