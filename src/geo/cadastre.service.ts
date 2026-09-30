// Le cadastre vu par l'API et la CLI : état d'une commune, demande de chargement (le worker charge),
// parcelles d'une emprise ou par identifiants, commune d'un point. Rien ici ne sort vers
// l'extérieur : la base, ou un job pour le worker.
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { Commune, CommuneRef, ParcelFeature, Parcels } from '../contracts/index.ts';
import type { SourceStateRow } from '../db/schema.ts';
import { type Bbox, bboxTooLarge, parcelLabel } from '../domain/index.ts';
import { Clock } from '../shared/clock.ts';
import { DomainError } from '../shared/errors.ts';
import { CADASTRE_QUEUE } from '../shared/queues.ts';
import { CommunesRepository } from './communes.repository.ts';
import { Lookups } from './lookups.ts';
import { type ParcelRecord, ParcelsRepository } from './parcels.repository.ts';
import { SourceStatesRepository } from './source-states.repository.ts';

export const CADASTRE_SOURCE = 'cadastre';
export const LOAD_COMMUNE_JOB = 'cadastre:load-commune';
/** Parcelles au plus par réponse d'emprise (F-01, règles métier). */
export const PARCELS_LIMIT = 5_000;

export interface LoadCommuneJob {
  code: string;
}

/** Un seul job par commune dans la file : le second dépôt est sans effet. */
export function loadJobId(code: string): string {
  return `load-commune-${code}`;
}

export function toFeature(p: ParcelRecord): ParcelFeature {
  return {
    type: 'Feature',
    id: p.id,
    geometry: p.geometry as ParcelFeature['geometry'],
    properties: {
      communeCode: p.communeCode,
      prefix: p.prefix,
      section: p.section,
      number: p.number,
      label: parcelLabel(p),
      contenance: p.contenance,
    },
  };
}

function cadastreState(state: SourceStateRow | undefined): Commune['cadastre'] {
  return {
    status: state?.status ?? 'missing',
    version: state?.version ?? null,
    loadedAt: state?.loadedAt?.toISOString() ?? null,
    parcelCount: state?.itemCount ?? null,
    error: state?.error ?? null,
  };
}

@Injectable()
export class CadastreService {
  constructor(
    private readonly communes: CommunesRepository,
    private readonly parcelsRepository: ParcelsRepository,
    private readonly states: SourceStatesRepository,
    private readonly lookups: Lookups,
    private readonly clock: Clock,
    @InjectQueue(CADASTRE_QUEUE) private readonly queue: Queue,
  ) {}

  async commune(code: string): Promise<Commune> {
    const [c, state] = await Promise.all([this.communes.byCode(code), this.states.get(CADASTRE_SOURCE, code)]);
    return { code, name: c?.name ?? null, center: c?.center ?? null, cadastre: cadastreState(state) };
  }

  /**
   * Met le chargement en file (idempotent) : sans effet sur un cadastre prêt (sauf `force`) ou
   * déjà en cours ; un échec se relance.
   */
  async requestLoad(code: string, force = false): Promise<Commune> {
    const state = await this.states.request(CADASTRE_SOURCE, code, this.clock.now(), force);
    if (state.status === 'queued') await this.enqueue(code);
    return this.commune(code);
  }

  async enqueue(code: string): Promise<void> {
    await this.queue.add(LOAD_COMMUNE_JOB, { code } satisfies LoadCommuneJob, {
      jobId: loadJobId(code),
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  async parcelsInBbox(bbox: Bbox): Promise<Parcels> {
    if (bboxTooLarge(bbox)) throw new DomainError('area-too-large');
    const { parcels, truncated } = await this.parcelsRepository.inBbox(bbox, PARCELS_LIMIT);
    return { type: 'FeatureCollection', features: parcels.map(toFeature), truncated };
  }

  async parcelsByIds(ids: readonly string[]): Promise<Parcels> {
    const parcels = await this.parcelsRepository.byIds(ids);
    return { type: 'FeatureCollection', features: parcels.map(toFeature), truncated: false };
  }

  async parcelAt(lon: number, lat: number): Promise<ParcelFeature | null> {
    const p = await this.parcelsRepository.at(lon, lat);
    return p ? toFeature(p) : null;
  }

  /** Parmi les communes chargées d'abord ; sinon par le worker (geo.api.gouv.fr). */
  async locate(lon: number, lat: number): Promise<CommuneRef | null> {
    const local = await this.communes.locate(lon, lat);
    if (local) return { code: local.code, name: local.name };
    return this.lookups.run('commune:locate', { lon, lat });
  }
}
