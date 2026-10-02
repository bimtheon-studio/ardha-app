// Bornes incendie d'une emprise (F-04, Q7), par cases de la grille gardées 30 jours en base : on
// n'interroge Overpass que pour les cases inconnues ou trop vieilles. Overpass sature souvent (504,
// 429) : une case déjà connue, même vieille, sert alors telle quelle ; seule une case jamais chargée
// rend les bornes « indisponibles ».
import { Injectable, Logger } from '@nestjs/common';

import { type Bbox, cellKey, gridCells, HYDRANTS_FRESHNESS_DAYS } from '../domain/index.ts';
import { HydrantsRepository, type HydrantRecord } from '../geo/hydrants.repository.ts';
import { SourceStatesRepository } from '../geo/source-states.repository.ts';
import { Clock } from '../shared/clock.ts';
import { Hydrants } from '../sources/hydrants.ts';

export const HYDRANTS_SOURCE = 'osm-hydrants';
const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class HydrantCache {
  private readonly logger = new Logger('HydrantCache');

  constructor(
    private readonly overpass: Hydrants,
    private readonly hydrants: HydrantsRepository,
    private readonly states: SourceStatesRepository,
    private readonly clock: Clock,
  ) {}

  /** Bornes de l'emprise, et la date de la case la plus ancienne (ce que l'analyse cite). */
  async inBbox(bbox: Bbox): Promise<{ items: HydrantRecord[]; asOf: Date }> {
    const now = this.clock.now();
    let asOf = now;
    for (const cell of gridCells(bbox)) {
      const key = cellKey(cell);
      const state = await this.states.get(HYDRANTS_SOURCE, key);
      const loadedAt = state?.loadedAt ?? null;
      if (loadedAt && now.getTime() - loadedAt.getTime() < HYDRANTS_FRESHNESS_DAYS * DAY_MS) {
        if (loadedAt < asOf) asOf = loadedAt;
        continue;
      }
      try {
        await this.states.markLoading(HYDRANTS_SOURCE, key, now);
        const items = await this.overpass.inBbox(cell);
        await this.hydrants.replaceCell(
          key,
          items.map((h) => ({ id: h.id, lon: h.lon, lat: h.lat, type: h.type, flowRate: h.flowRate, diameter: h.diameter, ref: h.ref })),
        );
        await this.states.markReady(HYDRANTS_SOURCE, key, now.toISOString().slice(0, 10), items.length, now);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.states.markFailed(HYDRANTS_SOURCE, key, message, now, false);
        // Jamais chargée : rien à servir à la place.
        if (!loadedAt) throw error;
        this.logger.warn(`Overpass indisponible pour la case ${key} : bornes du ${loadedAt.toISOString().slice(0, 10)} gardées`);
        if (loadedAt < asOf) asOf = loadedAt;
      }
    }
    return { items: await this.hydrants.inBbox(bbox), asOf };
  }
}
