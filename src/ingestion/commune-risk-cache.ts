// Données communales de Géorisques (radon, sismicité, GASPAR, PPR, CatNat) gardées 30 jours en base
// (F-04, demande du porteur du produit, 02/10/2026) : la deuxième étude d'une commune n'interroge plus
// la source ; une donnée déjà connue, même vieille, sert quand Géorisques se tait.
import { Injectable, Logger } from '@nestjs/common';

import { GEORISQUES_FRESHNESS_DAYS } from '../domain/index.ts';
import { CommuneRisksRepository } from '../geo/commune-risks.repository.ts';
import { Clock } from '../shared/clock.ts';

const DAY_MS = 24 * 3600 * 1000;

export interface Cached<T> {
  data: T;
  fetchedAt: Date;
  /** `fresh` : en base depuis moins de 30 jours ; `stale` : plus vieille, gardée faute de réponse. */
  origin: 'fetched' | 'fresh' | 'stale';
}

@Injectable()
export class CommuneRiskCache {
  private readonly logger = new Logger('CommuneRiskCache');

  constructor(
    private readonly repository: CommuneRisksRepository,
    private readonly clock: Clock,
  ) {}

  /** La donnée `part` de la commune : en base si elle est fraîche, sinon `fetch`, gardée ensuite. */
  async get<T>(communeCode: string, part: string, fetch: () => Promise<T>): Promise<Cached<T>> {
    const now = this.clock.now();
    const known = await this.repository.get(communeCode, part);
    if (known && now.getTime() - known.fetchedAt.getTime() < GEORISQUES_FRESHNESS_DAYS * DAY_MS) {
      return { data: known.data as T, fetchedAt: known.fetchedAt, origin: 'fresh' };
    }
    try {
      const data = await fetch();
      await this.repository.save(communeCode, part, data, now);
      return { data, fetchedAt: now, origin: 'fetched' };
    } catch (error) {
      if (!known) throw error;
      this.logger.warn(`Géorisques muet pour ${part} de ${communeCode} : donnée du ${known.fetchedAt.toISOString().slice(0, 10)} gardée`);
      return { data: known.data as T, fetchedAt: known.fetchedAt, origin: 'stale' };
    }
  }
}
