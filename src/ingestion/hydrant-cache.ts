// Bornes incendie d'une emprise (F-04, Q7), par cases de la grille gardées 30 jours en base : on
// n'interroge Overpass que pour les cases inconnues ou trop vieilles. Overpass sature souvent (504,
// 429) : une case déjà connue, même vieille, sert alors telle quelle ; seule une case jamais chargée
// rend les bornes « indisponibles ».
import { Injectable, Logger } from '@nestjs/common';

import { type Bbox, cellKey, HYDRANTS_FRESHNESS_DAYS, MAX_HYDRANT_CELLS } from '../domain/index.ts';
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

  /**
   * Bornes des cases demandées, et la date de la case la plus ancienne (ce que l'analyse cite). Les
   * cases à charger le sont en une seule requête : une étude courante en compte 4 à 6, et Overpass
   * coûte autant pour une que pour toutes.
   */
  async inCells(grid: readonly Bbox[]): Promise<{ items: HydrantRecord[]; asOf: Date; cells: { fresh: number; fetched: number; stale: number } }> {
    if (grid.length > MAX_HYDRANT_CELLS) throw new Error(`Étude trop dispersée pour les bornes : ${grid.length} cases (au plus ${MAX_HYDRANT_CELLS})`);
    const now = this.clock.now();
    let asOf = now;
    const cells = { fresh: 0, fetched: 0, stale: 0 };
    const toLoad: { cell: Bbox; key: string; loadedAt: Date | null }[] = [];
    for (const cell of grid) {
      const key = cellKey(cell);
      const loadedAt = (await this.states.get(HYDRANTS_SOURCE, key))?.loadedAt ?? null;
      if (loadedAt && now.getTime() - loadedAt.getTime() < HYDRANTS_FRESHNESS_DAYS * DAY_MS) {
        if (loadedAt < asOf) asOf = loadedAt;
        cells.fresh++;
      } else toLoad.push({ cell, key, loadedAt });
    }
    if (toLoad.length > 0) {
      for (const c of toLoad) await this.states.markLoading(HYDRANTS_SOURCE, c.key, now);
      try {
        const found = await this.overpass.inBboxes(toLoad.map((c) => c.cell));
        // Chaque borne va à la première case chargée qui la contient (une borne au bord est dans deux).
        const byCell = new Map<string, HydrantRecord[]>(toLoad.map((c) => [c.key, []]));
        for (const h of found) {
          const home = toLoad.find(({ cell: [w, s, e, n] }) => h.lon >= w && h.lon <= e && h.lat >= s && h.lat <= n);
          if (home) byCell.get(home.key)!.push({ id: h.id, lon: h.lon, lat: h.lat, type: h.type, flowRate: h.flowRate, diameter: h.diameter, ref: h.ref });
        }
        for (const c of toLoad) {
          const items = byCell.get(c.key)!;
          await this.hydrants.replaceCell(c.key, items);
          await this.states.markReady(HYDRANTS_SOURCE, c.key, now.toISOString().slice(0, 10), items.length, now);
        }
        cells.fetched = toLoad.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const c of toLoad) await this.states.markFailed(HYDRANTS_SOURCE, c.key, message, now, false);
        // Une case jamais chargée : rien à servir à la place.
        if (toLoad.some((c) => !c.loadedAt)) throw error;
        for (const c of toLoad) if (c.loadedAt! < asOf) asOf = c.loadedAt!;
        this.logger.warn(`Overpass indisponible : bornes de ${toLoad.length} case(s) gardées telles quelles`);
        cells.stale = toLoad.length;
      }
    }
    const items = new Map<string, HydrantRecord>();
    for (const cell of grid) for (const h of await this.hydrants.inBbox(cell)) items.set(h.id, h);
    return { items: [...items.values()], asOf, cells };
  }
}
