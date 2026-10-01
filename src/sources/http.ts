// Accès HTTP aux sources publiques. Seul le worker (et la CLI, pour le débogage) s'en sert : l'API ne
// sort jamais (PLAN §3), et le lint l'interdit ailleurs.
//
// Trois implémentations :
//  - `LiveHttp` : l'appel réel, avec délai maximal et reprises sur les erreurs passagères ;
//  - `RecordedHttp` : les réponses enregistrées dans `fixtures/http/` (tests, seed, e2e : sans Internet) ;
//  - `RecordingHttp` : l'appel réel, dont la réponse est enregistrée pour `RecordedHttp`.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export interface HttpResponse {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

export interface HttpRequest {
  url: string;
  /** Délai maximal d'une tentative, en millisecondes. */
  timeoutMs?: number;
  /**
   * En-têtes en plus (jeton d'une API). Ils ne font pas partie de la clé d'un enregistrement et ne
   * sont jamais écrits dans `fixtures/http`.
   */
  headers?: Record<string, string>;
}

/** Une source injoignable, qui répond mal, ou dont la réponse ne se lit pas. */
export class SourceError extends Error {
  constructor(
    readonly source: string,
    readonly kind: 'unavailable' | 'invalid' | 'missing-fixture',
    message: string,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export abstract class Http {
  abstract get(request: HttpRequest): Promise<HttpResponse>;
}

const USER_AGENT = 'Ardha (analyse de terrain ; https://ardha.fr)';
const RETRIABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface LiveOptions {
  attempts?: number;
  /** Attente avant la 2e tentative ; doublée ensuite. */
  backoffMs?: number;
  fetch?: typeof fetch;
}

export class LiveHttp extends Http {
  private readonly attempts: number;
  private readonly backoffMs: number;
  private readonly fetch: typeof fetch;

  constructor(options: LiveOptions = {}) {
    super();
    this.attempts = options.attempts ?? 3;
    this.backoffMs = options.backoffMs ?? 300;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async get({ url, timeoutMs = 15_000, headers = {} }: HttpRequest): Promise<HttpResponse> {
    const host = new URL(url).host;
    let last = '';
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      if (attempt > 1) await sleep(this.backoffMs * 2 ** (attempt - 2));
      try {
        const r = await this.fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...headers },
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = Buffer.from(await r.arrayBuffer());
        if (RETRIABLE.has(r.status)) {
          last = `HTTP ${r.status}`;
          continue;
        }
        return { url, status: r.status, contentType: r.headers.get('content-type') ?? '', body };
      } catch (error) {
        last = error instanceof Error && error.name === 'TimeoutError' ? `délai de ${timeoutMs} ms dépassé` : String(error);
      }
    }
    throw new SourceError(host, 'unavailable', `${host} injoignable après ${this.attempts} tentative(s) : ${last}`);
  }
}

/** Nom de fichier stable pour une URL : hôte, chemin lisible, empreinte de l'URL complète. */
export function fixtureName(url: string): string {
  const u = new URL(url);
  u.searchParams.sort();
  const slug = `${u.pathname}`.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  const hash = createHash('sha256').update(u.toString()).digest('hex').slice(0, 12);
  return path.join(u.host, `${slug || 'root'}-${hash}`);
}

interface Meta {
  url: string;
  status: number;
  contentType: string;
}

export class RecordedHttp extends Http {
  constructor(readonly dir: string) {
    super();
  }

  async get({ url }: HttpRequest): Promise<HttpResponse> {
    const base = path.join(this.dir, fixtureName(url));
    if (!existsSync(`${base}.json`)) {
      throw new SourceError(
        new URL(url).host,
        'missing-fixture',
        `Réponse enregistrée absente pour ${url} (fichier ${base}.json). Enregistrer : pnpm cli source:record "${url}"`,
      );
    }
    const meta = JSON.parse(await readFile(`${base}.json`, 'utf8')) as Meta;
    return { ...meta, url, body: await readFile(`${base}.body`) };
  }
}

export class RecordingHttp extends Http {
  constructor(
    private readonly live: Http,
    readonly dir: string,
  ) {
    super();
  }

  async get(request: HttpRequest): Promise<HttpResponse> {
    const r = await this.live.get(request);
    const base = path.join(this.dir, fixtureName(request.url));
    await mkdir(path.dirname(base), { recursive: true });
    const meta: Meta = { url: request.url, status: r.status, contentType: r.contentType };
    await writeFile(`${base}.json`, `${JSON.stringify(meta, null, 2)}\n`);
    await writeFile(`${base}.body`, r.body);
    return r;
  }
}
