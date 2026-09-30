// Communes (données de référence) : nom, codes postaux, centre et contour, tels que geo.api.gouv.fr
// les donne.
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DB, type Db } from '../db/db.ts';
import type { MultiPolygon } from '../domain/index.ts';

export type CommuneRecord = {
  code: string;
  name: string;
  departmentCode: string;
  postcodes: string[];
  center: [number, number] | null;
};

export type NewCommune = CommuneRecord & { contour: MultiPolygon | null };

const columns = sql`code, name, department_code AS "departmentCode", postcodes,
  CASE WHEN center IS NULL THEN NULL ELSE json_build_array(ST_X(center), ST_Y(center)) END AS center`;

@Injectable()
export class CommunesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(c: NewCommune): Promise<void> {
    const center = c.center ? sql`ST_SetSRID(ST_MakePoint(${c.center[0]}, ${c.center[1]}), 4326)` : sql`NULL`;
    const contour = c.contour ? sql`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(c.contour)}), 4326))` : sql`NULL`;
    await this.db.execute(sql`
      INSERT INTO communes (code, name, department_code, postcodes, center, contour, updated_at)
      VALUES (${c.code}, ${c.name}, ${c.departmentCode}, ${sql.param(c.postcodes)}::text[], ${center}, ${contour}, now())
      ON CONFLICT (code) DO UPDATE SET name = excluded.name, department_code = excluded.department_code,
        postcodes = excluded.postcodes, center = excluded.center, contour = excluded.contour, updated_at = now()`);
  }

  async byCode(code: string): Promise<CommuneRecord | undefined> {
    const r = await this.db.execute<CommuneRecord>(sql`SELECT ${columns} FROM communes WHERE code = ${code}`);
    return r.rows[0];
  }

  /** Parmi les communes chargées, celle dont le contour contient le point. */
  async locate(lon: number, lat: number): Promise<CommuneRecord | undefined> {
    const point = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
    const r = await this.db.execute<CommuneRecord>(sql`
      SELECT ${columns} FROM communes WHERE contour && ${point} AND ST_Intersects(contour, ${point}) LIMIT 1`);
    return r.rows[0];
  }

  async list(): Promise<CommuneRecord[]> {
    const r = await this.db.execute<CommuneRecord>(sql`SELECT ${columns} FROM communes ORDER BY code`);
    return r.rows;
  }
}
