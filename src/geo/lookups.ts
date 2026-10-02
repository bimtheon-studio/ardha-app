// Recherches à la demande (adresse, commune d'un point) : l'API ne sort pas, elle dépose un job dans
// la file `lookups` et attend la réponse du worker, quelques secondes au plus (F-01, Q1). Les
// réponses sont gardées 24 h dans Redis, qui n'est qu'un cache : il se reconstruit.
import { createHash } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { type Queue, QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';

import type { Address, CommuneRef } from '../contracts/index.ts';
import { CONFIG, type Config } from '../config/config.ts';
import { DomainError } from '../shared/errors.ts';
import { LOOKUPS_QUEUE, redisConnection } from '../shared/queues.ts';
import { REDIS } from '../shared/redis.ts';

/** Chaque recherche : sa donnée d'entrée, sa réponse. */
export interface LookupJobs {
  'address:search': { input: { q: string; limit: number }; output: Address[] };
  'address:reverse': { input: { lon: number; lat: number }; output: Address | null };
  'commune:locate': { input: { lon: number; lat: number }; output: CommuneRef | null };
  /** Altitudes IGN de points `[lon, lat]` (F-04, Q6) ; `z` nul hors couverture. */
  'elevation:points': { input: { points: [number, number][] }; output: { lon: number; lat: number; z: number | null }[] };
}
export type LookupName = keyof LookupJobs;

/** Au-delà, le job n'intéresse plus personne : le worker l'ignore. */
export const LOOKUP_EXPIRY_MS = 10_000;
const CACHE_TTL_S = 24 * 3600;
/** Une réponse vide se garde moins longtemps : une adresse tout juste créée finit par apparaître. */
const EMPTY_CACHE_TTL_S = 3600;

@Injectable()
export class Lookups implements OnModuleDestroy {
  private events?: QueueEvents;

  constructor(
    @InjectQueue(LOOKUPS_QUEUE) private readonly queue: Queue,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  private cacheKey(name: string, input: unknown): string {
    const hash = createHash('sha256').update(`${name}\n${JSON.stringify(input)}`).digest('hex').slice(0, 32);
    return `${this.config.QUEUE_PREFIX}:lookup-cache:${hash}`;
  }

  private queueEvents(): QueueEvents {
    this.events ??= new QueueEvents(LOOKUPS_QUEUE, {
      connection: redisConnection(this.config.REDIS_URL),
      prefix: this.config.QUEUE_PREFIX,
    });
    return this.events;
  }

  async run<N extends LookupName>(name: N, input: LookupJobs[N]['input']): Promise<LookupJobs[N]['output']> {
    const key = this.cacheKey(name, input);
    const cached = await this.redis.get(key);
    if (cached !== null) return JSON.parse(cached) as LookupJobs[N]['output'];

    const events = this.queueEvents();
    await events.waitUntilReady();
    const job = await this.queue.add(name, input, { removeOnComplete: { age: 60 }, removeOnFail: { age: 600 }, attempts: 1 });
    let output: LookupJobs[N]['output'];
    try {
      output = (await job.waitUntilFinished(events, this.config.LOOKUP_TIMEOUT_MS)) as LookupJobs[N]['output'];
    } catch {
      throw new DomainError('lookup-unavailable');
    }
    const empty = output === null || (Array.isArray(output) && output.length === 0);
    await this.redis.set(key, JSON.stringify(output), 'EX', empty ? EMPTY_CACHE_TTL_S : CACHE_TTL_S);
    return output;
  }

  async onModuleDestroy(): Promise<void> {
    await this.events?.close();
  }
}
