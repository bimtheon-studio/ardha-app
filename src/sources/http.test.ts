import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtureName, LiveHttp, RecordedHttp, RecordingHttp, SourceError } from './http.ts';

const ok = (body = 'ok', status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain' } });

describe('LiveHttp', () => {
  it('rend la réponse, avec un User-Agent qui nomme Ardha', async () => {
    const fetch = vi.fn(async () => ok('bonjour'));
    const r = await new LiveHttp({ fetch }).get({ url: 'https://exemple.fr/a' });
    expect(r).toMatchObject({ status: 200, contentType: 'text/plain' });
    expect(r.body.toString()).toBe('bonjour');
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ 'User-Agent': expect.stringContaining('Ardha') });
  });

  it('réessaie les erreurs passagères, pas les 404', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok('', 503)).mockRejectedValueOnce(new TypeError('réseau')).mockResolvedValueOnce(ok('enfin'));
    const r = await new LiveHttp({ fetch, backoffMs: 1 }).get({ url: 'https://exemple.fr/a' });
    expect(r.body.toString()).toBe('enfin');
    expect(fetch).toHaveBeenCalledTimes(3);
    const notFound = vi.fn(async () => ok('', 404));
    expect((await new LiveHttp({ fetch: notFound }).get({ url: 'https://exemple.fr/b' })).status).toBe(404);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('abandonne après les tentatives, en disant pourquoi (délai dépassé compris)', async () => {
    const timeout = Object.assign(new Error('trop long'), { name: 'TimeoutError' });
    const fetch = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(ok('', 502));
    const e = await new LiveHttp({ fetch, attempts: 2, backoffMs: 1 }).get({ url: 'https://exemple.fr/a', timeoutMs: 5 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SourceError);
    expect(e).toMatchObject({ source: 'exemple.fr', kind: 'unavailable', message: 'exemple.fr injoignable après 2 tentative(s) : HTTP 502' });
    const timeouts = vi.fn().mockRejectedValue(timeout);
    await expect(new LiveHttp({ fetch: timeouts, attempts: 1 }).get({ url: 'https://exemple.fr/a', timeoutMs: 5 })).rejects.toThrow('délai de 5 ms dépassé');
  });

  it('utilise le fetch global par défaut', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('global')));
    expect((await new LiveHttp().get({ url: 'https://exemple.fr/' })).body.toString()).toBe('global');
    vi.unstubAllGlobals();
  });
});

describe('réponses enregistrées', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('nom de fichier stable, indépendant de l’ordre des paramètres', () => {
    expect(fixtureName('https://geo.api.gouv.fr/communes?b=2&a=1')).toBe(fixtureName('https://geo.api.gouv.fr/communes?a=1&b=2'));
    expect(fixtureName('https://geo.api.gouv.fr/communes?a=1')).toMatch(/^geo\.api\.gouv\.fr\/communes-[0-9a-f]{12}$/);
    expect(fixtureName('https://exemple.fr/')).toMatch(/^exemple\.fr\/root-/);
  });

  it('enregistre une réponse réelle puis la rejoue sans réseau ; une absente dit comment l’enregistrer', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ardha-http-'));
    const live = new LiveHttp({ fetch: vi.fn(async () => ok('réel', 200)) });
    await new RecordingHttp(live, dir).get({ url: 'https://exemple.fr/x?y=1' });
    const replay = await new RecordedHttp(dir).get({ url: 'https://exemple.fr/x?y=1' });
    expect(replay).toMatchObject({ status: 200, contentType: 'text/plain' });
    expect(replay.body.toString()).toBe('réel');
    const e = await new RecordedHttp(dir).get({ url: 'https://exemple.fr/autre' }).catch((x: unknown) => x);
    expect(e).toMatchObject({ kind: 'missing-fixture', message: expect.stringContaining('pnpm cli source:record "https://exemple.fr/autre"') });
  });
});
