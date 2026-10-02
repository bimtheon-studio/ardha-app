// Bornes incendie d'OpenStreetMap (données de référence, F-04) : remplacées case par case, lues par
// emprise.
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { DB, type Db } from '../db/db.ts';
import { hydrant } from '../db/schema.ts';
import type { Bbox } from '../domain/index.ts';

export type HydrantRecord = {
  id: string;
  lon: number;
  lat: number;
  type: string | null;
  flowRate: string | null;
  diameter: string | null;
  ref: string | null;
};

@Injectable()
export class HydrantsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Remplace les bornes d'une case, en une transaction. Une borne au bord reste à la première case qui l'a vue. */
  async replaceCell(cell: string, items: readonly HydrantRecord[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(hydrant).where(eq(hydrant.cell, cell));
      if (items.length === 0) return;
      await tx.execute(sql`
        INSERT INTO hydrants (id, cell, point, type, flow_rate, diameter, ref)
        SELECT r.id, ${cell}, ST_SetSRID(ST_MakePoint(r.lon, r.lat), 4326), r.type, r."flowRate", r.diameter, r.ref
        FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb)
          AS r(id text, lon float8, lat float8, type text, "flowRate" text, diameter text, ref text)
        ON CONFLICT (id) DO NOTHING`);
    });
  }

  async inBbox([w, s, e, n]: Bbox): Promise<HydrantRecord[]> {
    const r = await this.db.execute<HydrantRecord>(sql`
      SELECT id, ST_X(point) AS lon, ST_Y(point) AS lat, type, flow_rate AS "flowRate", diameter, ref
      FROM hydrants WHERE point && ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326) ORDER BY id`);
    return r.rows;
  }
}
