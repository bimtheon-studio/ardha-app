// Faux HTTP pour les tests : des réponses par préfixe d'URL (ou par URL exacte, clé terminée par `$`),
// et la liste des URL appelées. Sans réponse prévue : 404.
import { gzipSync } from 'node:zlib';

import { Http, type HttpRequest, type HttpResponse } from '../src/sources/http.ts';

export type FakeReply = { status?: number; json?: unknown; text?: string; gzipJson?: unknown; gzipText?: string; body?: Buffer } | Error;

export class FakeHttp extends Http {
  readonly calls: string[] = [];

  constructor(public replies: Record<string, FakeReply> = {}) {
    super();
  }

  async get({ url }: HttpRequest): Promise<HttpResponse> {
    this.calls.push(url);
    const key = Object.keys(this.replies)
      .filter((k) => (k.endsWith('$') ? url === k.slice(0, -1) : url.startsWith(k)))
      .sort((a, b) => b.length - a.length)[0];
    if (key === undefined) return { url, status: 404, contentType: 'text/plain', body: Buffer.from('introuvable') };
    const r = this.replies[key]!;
    if (r instanceof Error) throw r;
    const body =
      r.body ??
      (r.gzipText !== undefined ? gzipSync(r.gzipText) : undefined) ??
      (r.gzipJson !== undefined
        ? gzipSync(JSON.stringify(r.gzipJson))
        : Buffer.from(r.text ?? JSON.stringify(r.json ?? null)));
    return { url, status: r.status ?? 200, contentType: 'application/json', body };
  }
}
