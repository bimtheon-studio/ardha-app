import net from 'node:net';

import { describe, expect, it } from 'vitest';

import { portVraimentLibre } from './free-port.ts';

describe('portVraimentLibre', () => {
  it('voit un port occupé, puis libéré', async () => {
    const serveur = net.createServer();
    await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r));
    const port = (serveur.address() as net.AddressInfo).port;
    expect(await portVraimentLibre(port)).toBe(false);
    await new Promise<void>((r) => serveur.close(() => r()));
    expect(await portVraimentLibre(port)).toBe(true);
  });
});
