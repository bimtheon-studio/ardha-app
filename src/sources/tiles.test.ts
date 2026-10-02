import { describe, expect, it } from 'vitest';

import { FakeHttp } from '../../test/fake-http.ts';
import { RecordedHttp } from './http.ts';
import { OSM_TILES, Tiles } from './tiles.ts';

describe('Tiles', () => {
  it('lit une tuile OSM enregistrée', async () => {
    const recorded = new RecordedHttp(new URL('../../fixtures/http', import.meta.url).pathname);
    const png = await new Tiles(recorded).get(15, 16489, 11499);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(OSM_TILES).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  });

  it('refuse une erreur HTTP ou une réponse qui n’est pas une image', async () => {
    await expect(new Tiles(new FakeHttp()).get(1, 2, 3)).rejects.toThrow('Tuile 1/2/3 : HTTP 404');
    const json = new FakeHttp({ 'https://tile.openstreetmap.org/': { json: {} } });
    await expect(new Tiles(json).get(1, 2, 3)).rejects.toThrow('Tuile 1/2/3 : application/json');
  });
});
