// Parcelles du cadastre (données de référence). Géométries lues en GeoJSON, écrites en masse depuis
// un document JSON (une requête par lot, sans un paramètre par colonne).
import { Inject, Injectable } from '@nestjs/common';
import { count, eq, sql } from 'drizzle-orm';

import { DB, type Db } from '../db/db.ts';
import { parcel } from '../db/schema.ts';
import type { Bbox, MultiPolygon, Surface } from '../domain/index.ts';

export type ParcelRecord = {
  id: string;
  communeCode: string;
  prefix: string;
  section: string;
  number: string;
  contenance: number | null;
  geometry: Surface;
  version: string;
};

export interface NewParcel {
  id: string;
  prefix: string;
  section: string;
  number: string;
  contenance: number | null;
  geometry: MultiPolygon;
}

const BATCH = 2_000;

const columns = sql`id, commune_code AS "communeCode", prefix, section, number, contenance, version,
  ST_AsGeoJSON(geometry, 7)::json AS geometry`;

@Injectable()
export class ParcelsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Remplace toutes les parcelles d'une commune, en une transaction (lecteurs jamais à vide). */
  async replaceForCommune(communeCode: string, version: string, parcels: readonly NewParcel[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(parcel).where(eq(parcel.communeCode, communeCode));
      for (let i = 0; i < parcels.length; i += BATCH) {
        const rows = JSON.stringify(parcels.slice(i, i + BATCH));
        await tx.execute(sql`
          INSERT INTO parcels (id, commune_code, prefix, section, number, contenance, geometry, version)
          SELECT r.id, ${communeCode}, r.prefix, r.section, r.number, r.contenance,
                 ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(r.geometry), 4326)), ${version}
          FROM jsonb_to_recordset(${rows}::jsonb)
            AS r(id text, prefix text, section text, number text, contenance integer, geometry jsonb)
          ON CONFLICT (id) DO NOTHING`);
      }
    });
  }

  /** Parcelles qui recoupent l'emprise, par identifiant, au plus `limit` (+1 pour savoir si l'on a coupé). */
  async inBbox([w, s, e, n]: Bbox, limit: number): Promise<{ parcels: ParcelRecord[]; truncated: boolean }> {
    const envelope = sql`ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326)`;
    const r = await this.db.execute<ParcelRecord>(sql`
      SELECT ${columns} FROM parcels
      WHERE geometry && ${envelope} AND ST_Intersects(geometry, ${envelope})
      ORDER BY id LIMIT ${limit + 1}`);
    return { parcels: r.rows.slice(0, limit), truncated: r.rows.length > limit };
  }

  /** Dans l'ordre demandé ; les identifiants inconnus sont omis. */
  async byIds(ids: readonly string[]): Promise<ParcelRecord[]> {
    if (ids.length === 0) return [];
    const r = await this.db.execute<ParcelRecord>(sql`
      SELECT ${columns} FROM parcels WHERE id = ANY(${sql.param([...ids])}::text[])`);
    const byId = new Map(r.rows.map((p) => [p.id, p]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /** La parcelle qui contient le point. */
  async at(lon: number, lat: number): Promise<ParcelRecord | undefined> {
    const point = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
    const r = await this.db.execute<ParcelRecord>(sql`
      SELECT ${columns} FROM parcels WHERE geometry && ${point} AND ST_Intersects(geometry, ${point}) LIMIT 1`);
    return r.rows[0];
  }

  async countForCommune(communeCode: string): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(parcel).where(eq(parcel.communeCode, communeCode));
    return r?.n ?? 0;
  }
}
