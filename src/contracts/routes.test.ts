import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { messagesByField } from './routes.ts';

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
