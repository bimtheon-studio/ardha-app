// Recherches à la demande (adresse, commune d'un point, altitudes) : seule exception à « seul le
// worker sort » (DT-20, amendée le 09/10/2026). L'API interroge la source directement, quelques
// secondes au plus ; la file et le worker n'apportaient qu'un aller-retour de plus. Les réponses
// sont gardées 24 h dans Redis, qui n'est qu'un cache : il se reconstruit. Le lint n'autorise que ce
// fichier, côté API, à toucher aux sources. Le débit est limité par processus, comme le faisait la file
// `lookups` avant DT-20 ; une recherche hors délai coupe son appel à la source.
import { createHash } from 'node:crypto';

import { Inject, Injectable, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';

import type { Address, CommuneRef } from '../contracts/index.ts';
import { CONFIG, type Config } from '../config/config.ts';
import { DomainError } from '../shared/errors.ts';
import { REDIS } from '../shared/redis.ts';
import { Throttle } from '../shared/throttle.ts';
import { Communes } from '../sources/communes.ts';
import { Elevation } from '../sources/elevation.ts';
import { Geocoding } from '../sources/geocoding.ts';
import { SourcesModule } from '../sources/sources.module.ts';

/** Chaque recherche : sa donnée d'entrée, sa réponse. */
export interface LookupJobs {
  'address:search': { input: { q: string; limit: number }; output: Address[] };
  'address:reverse': { input: { lon: number; lat: number }; output: Address | null };
  'commune:locate': { input: { lon: number; lat: number }; output: CommuneRef | null };
  /** Altitudes IGN de points `[lon, lat]` (F-04, Q6) ; `z` nul hors couverture. */
  'elevation:points': { input: { points: [number, number][] }; output: { lon: number; lat: number; z: number | null }[] };
}
export type LookupName = keyof LookupJobs;

const CACHE_TTL_S = 24 * 3600;
/** Une réponse vide se garde moins longtemps : une adresse tout juste créée finit par apparaître. */
const EMPTY_CACHE_TTL_S = 3600;
/**
 * Sous la limite de la Géoplateforme (50 requêtes/s par IP, F-01) : au plus 40 recherches lancées par
 * seconde et 8 à la fois. Une recherche qui attend son tour au-delà du délai n'est jamais lancée.
 */
const RATE = { max: 40, windowMs: 1_000, concurrency: 8 };

@Injectable()
export class Lookups {
  private readonly throttle = new Throttle(RATE);

  constructor(
    private readonly geocoding: Geocoding,
    private readonly communes: Communes,
    private readonly elevation: Elevation,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  private cacheKey(name: string, input: unknown): string {
    const hash = createHash('sha256').update(`${name}\n${JSON.stringify(input)}`).digest('hex').slice(0, 32);
    return `${this.config.QUEUE_PREFIX}:lookup-cache:${hash}`;
  }

  async run<N extends LookupName>(name: N, input: LookupJobs[N]['input']): Promise<LookupJobs[N]['output']> {
    const key = this.cacheKey(name, input);
    const cached = await this.redis.get(key);
    if (cached !== null) return JSON.parse(cached) as LookupJobs[N]['output'];

    // Une panne ou une source trop lente ne se garde pas : la recherche suivante réessaie. Au délai,
    // le signal coupe l'appel en cours (et ses reprises) ; la course rend la main même à une source
    // qui l'ignorerait, et libère la place.
    const abandon = new AbortController();
    const timer = setTimeout(() => abandon.abort(new Error('délai dépassé')), this.config.LOOKUP_TIMEOUT_MS);
    const deadline = new Promise<never>((_, reject) => {
      abandon.signal.addEventListener('abort', () => reject(abandon.signal.reason as Error), { once: true });
    });
    let output: LookupJobs[N]['output'];
    try {
      output = await this.throttle.run(() => Promise.race([this.ask(name, input, abandon.signal), deadline]), abandon.signal);
    } catch {
      throw new DomainError('lookup-unavailable');
    } finally {
      clearTimeout(timer);
    }
    const empty = output === null || (Array.isArray(output) && output.length === 0);
    await this.redis.set(key, JSON.stringify(output), 'EX', empty ? EMPTY_CACHE_TTL_S : CACHE_TTL_S);
    return output;
  }

  private ask<N extends LookupName>(name: N, input: LookupJobs[N]['input'], signal: AbortSignal): Promise<LookupJobs[N]['output']>;
  private async ask(name: LookupName, input: never, signal: AbortSignal): Promise<unknown> {
    switch (name) {
      case 'address:search': {
        const { q, limit } = input as LookupJobs['address:search']['input'];
        return this.geocoding.search(q, limit, signal);
      }
      case 'address:reverse': {
        const { lon, lat } = input as LookupJobs['address:reverse']['input'];
        return this.geocoding.reverse(lon, lat, signal);
      }
      case 'commune:locate': {
        const { lon, lat } = input as LookupJobs['commune:locate']['input'];
        return this.communes.locate(lon, lat, signal);
      }
      case 'elevation:points': {
        const { points } = input as LookupJobs['elevation:points']['input'];
        return this.elevation.points(points, signal);
      }
      default:
        throw new Error(`Recherche inconnue : ${String(name)}`);
    }
  }
}

@Module({ imports: [SourcesModule], providers: [Lookups], exports: [Lookups] })
export class LookupsModule {}
