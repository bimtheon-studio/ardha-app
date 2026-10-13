// Recherches à la demande (adresse, commune d'un point, altitudes) : seule exception à « seul le
// worker sort » (DT-20, amendée le 09/10/2026). L'API interroge la source directement, quelques
// secondes au plus ; la file et le worker n'apportaient qu'un aller-retour de plus. Les réponses
// sont gardées 24 h dans Redis, qui n'est qu'un cache : il se reconstruit. Le lint n'autorise que ce
// fichier, côté API, à toucher aux sources.
import { createHash } from 'node:crypto';

import { Inject, Injectable, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';

import type { Address, CommuneRef } from '../contracts/index.ts';
import { CONFIG, type Config } from '../config/config.ts';
import { DomainError } from '../shared/errors.ts';
import { REDIS } from '../shared/redis.ts';
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

@Injectable()
export class Lookups {
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

    // Une panne ou une source trop lente ne se garde pas : la recherche suivante réessaie.
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('délai dépassé')), this.config.LOOKUP_TIMEOUT_MS);
    });
    let output: LookupJobs[N]['output'];
    try {
      output = await Promise.race([this.ask(name, input), deadline]);
    } catch {
      throw new DomainError('lookup-unavailable');
    } finally {
      clearTimeout(timer);
    }
    const empty = output === null || (Array.isArray(output) && output.length === 0);
    await this.redis.set(key, JSON.stringify(output), 'EX', empty ? EMPTY_CACHE_TTL_S : CACHE_TTL_S);
    return output;
  }

  private ask<N extends LookupName>(name: N, input: LookupJobs[N]['input']): Promise<LookupJobs[N]['output']>;
  private async ask(name: LookupName, input: never): Promise<unknown> {
    switch (name) {
      case 'address:search': {
        const { q, limit } = input as LookupJobs['address:search']['input'];
        return this.geocoding.search(q, limit);
      }
      case 'address:reverse': {
        const { lon, lat } = input as LookupJobs['address:reverse']['input'];
        return this.geocoding.reverse(lon, lat);
      }
      case 'commune:locate': {
        const { lon, lat } = input as LookupJobs['commune:locate']['input'];
        return this.communes.locate(lon, lat);
      }
      case 'elevation:points': {
        const { points } = input as LookupJobs['elevation:points']['input'];
        return this.elevation.points(points);
      }
      default:
        throw new Error(`Recherche inconnue : ${String(name)}`);
    }
  }
}

@Module({ imports: [SourcesModule], providers: [Lookups], exports: [Lookups] })
export class LookupsModule {}
