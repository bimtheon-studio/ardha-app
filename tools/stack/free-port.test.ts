import net from 'node:net';

import { describe, expect, it } from 'vitest';

import { portReallyFree } from './free-port.ts';

describe('portVraimentLibre', () => {
  it('voit un port occupé, puis libéré', async () => {
    const server = net.createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as net.AddressInfo).port;
    expect(await portReallyFree(port)).toBe(false);
    await new Promise<void>((r) => server.close(() => r()));
    expect(await portReallyFree(port)).toBe(true);
  });
});
