// Données de référence du marché (F-05) : ventes DVF, ECLN, indices INSEE, Sitadel. Les ventes se
// remplacent par département et par millésime, en une transaction ; les recherches dans un cercle
// passent par l'index GiST du point (`ST_DWithin` en géographie : rayon en mètres).
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { DB, type Db } from '../db/db.ts';
import { housingPermit, indexValue, newBuildPrice } from '../db/schema.ts';
import type { DvfMutation, IndexValue, NewBuildRow, PermitRow, PricedSale, SaleCategory } from '../domain/index.ts';

/** Une vente chargée : la mutation, son millésime, et ce qu'elle apporte aux prix. */
export type StoredMutation = DvfMutation & { year: number; departmentCode: string; category: SaleCategory | null; pricePerM2: number | null };

export type SaleRecord = {
  id: string;
  date: string;
  nature: string;
  vefa: boolean;
  price: number;
  propertyType: DvfMutation['propertyType'];
  category: SaleCategory | null;
  pricePerM2: number | null;
  builtArea: number | null;
  landArea: number | null;
  rooms: number | null;
  dwellingCount: number;
  address: string | null;
  postcode: string | null;
  communeCode: string;
  position: [number, number];
  distanceM: number;
  parcelIds: string[];
  parcels: { id: string; geometry: unknown }[];
};

export interface SalesFilter {
  type?: string;
  segment?: 'existing' | 'new';
  fromYear?: number;
}

const INSERT_CHUNK = 2000;

const circle = (center: readonly number[], radiusM: number) =>
  sql`ST_DWithin(m.point::geography, ST_SetSRID(ST_MakePoint(${center[0]}, ${center[1]}), 4326)::geography, ${radiusM})`;

const distance = (center: readonly number[]) =>
  sql`ST_Distance(m.point::geography, ST_SetSRID(ST_MakePoint(${center[0]}, ${center[1]}), 4326)::geography)`;

@Injectable()
export class MarketRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Remplace les ventes d'un département pour un millésime. Une vente à cheval sur deux départements
   * n'est gardée qu'une fois, par le premier chargé.
   */
  async replaceDvf(departmentCode: string, year: number, mutations: readonly StoredMutation[]): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM dvf_mutations WHERE department_code = ${departmentCode} AND year = ${year}`);
      let inserted = 0;
      for (let i = 0; i < mutations.length; i += INSERT_CHUNK) {
        const rows = JSON.stringify(mutations.slice(i, i + INSERT_CHUNK));
        const r = await tx.execute(sql`
          INSERT INTO dvf_mutations (id, year, department_code, commune_code, date, nature, vefa, price, property_type,
            dwelling_count, built_area, land_area, rooms, category, price_per_sqm, parcel_ids, address, postcode, point, locals, cultures)
          SELECT r.id, r.year, r."departmentCode", r."communeCode", r.date::date, r.nature, r.vefa, r.price, r."propertyType",
            r."dwellingCount", r."builtArea", r."landArea", r.rooms, r.category, r."pricePerM2",
            ARRAY(SELECT jsonb_array_elements_text(r."parcelIds")), r.address, r.postcode,
            CASE WHEN r.position IS NULL THEN NULL
                 ELSE ST_SetSRID(ST_MakePoint((r.position->>0)::float8, (r.position->>1)::float8), 4326) END,
            r.locals, ARRAY(SELECT jsonb_array_elements_text(r.cultures))
          FROM jsonb_to_recordset(${rows}::jsonb) AS r(id text, year integer, "departmentCode" text, "communeCode" text, date text,
            nature text, vefa boolean, price float8, "propertyType" text, "dwellingCount" integer, "builtArea" float8,
            "landArea" float8, rooms integer, category text, "pricePerM2" float8, "parcelIds" jsonb, address text,
            postcode text, position jsonb, locals jsonb, cultures jsonb)
          ON CONFLICT (id) DO NOTHING`);
        inserted += r.rowCount ?? 0;
      }
      return inserted;
    });
  }

  /** Ventes comparables du cercle (Q3), réduites à ce que les statistiques lisent. */
  async comparablesWithin(center: readonly number[], radiusM: number): Promise<PricedSale[]> {
    const r = await this.db.execute<PricedSale & Record<string, unknown>>(sql`
      SELECT to_char(m.date, 'YYYY-MM-DD') AS date, m.category, CASE WHEN m.vefa THEN 'new' ELSE 'existing' END AS segment,
             m.price_per_sqm AS "pricePerM2"
      FROM dvf_mutations m WHERE m.category IS NOT NULL AND ${circle(center, radiusM)}`);
    return r.rows;
  }

  /** Ventes du cercle par commune, et première et dernière dates. */
  async circleSummary(center: readonly number[], radiusM: number): Promise<{ communes: { code: string; sales: number }[]; from: string | null; to: string | null }> {
    const r = await this.db.execute<{ code: string; sales: number; from: string; to: string }>(sql`
      SELECT m.commune_code AS code, count(*)::int AS sales, to_char(min(m.date), 'YYYY-MM-DD') AS "from", to_char(max(m.date), 'YYYY-MM-DD') AS "to"
      FROM dvf_mutations m WHERE ${circle(center, radiusM)} GROUP BY m.commune_code ORDER BY sales DESC, code`);
    const from = r.rows.reduce<string | null>((a, x) => (a === null || x.from < a ? x.from : a), null);
    const to = r.rows.reduce<string | null>((a, x) => (a === null || x.to > a ? x.to : a), null);
    return { communes: r.rows.map(({ code, sales }) => ({ code, sales })), from, to };
  }

  /** Dernière date de vente connue des départements : la fin des 12 mois du prix courant. */
  async horizon(departmentCodes: readonly string[]): Promise<string | null> {
    if (departmentCodes.length === 0) return null;
    const r = await this.db.execute<{ horizon: string | null }>(sql`
      SELECT to_char(max(date), 'YYYY-MM-DD') AS horizon FROM dvf_mutations
      WHERE department_code IN (${sql.join(departmentCodes.map((d) => sql`${d}`), sql`, `)})`);
    return r.rows[0]?.horizon ?? null;
  }

  /** Ventes du cercle, les plus récentes d'abord, avec les parcelles vendues dont le cadastre est chargé. */
  async salesWithin(center: readonly number[], radiusM: number, filter: SalesFilter, limit: number): Promise<SaleRecord[]> {
    const conditions = [circle(center, radiusM)];
    if (filter.type && filter.type !== 'all') conditions.push(sql`m.property_type = ${filter.type}`);
    if (filter.segment) conditions.push(sql`m.vefa = ${filter.segment === 'new'}`);
    if (filter.fromYear) conditions.push(sql`m.date >= make_date(${filter.fromYear}, 1, 1)`);
    const r = await this.db.execute<SaleRecord>(sql`
      SELECT m.id, to_char(m.date, 'YYYY-MM-DD') AS date, m.nature, m.vefa, m.price, m.property_type AS "propertyType",
             m.category, m.price_per_sqm AS "pricePerM2", m.built_area AS "builtArea", m.land_area AS "landArea", m.rooms,
             m.dwelling_count AS "dwellingCount", m.address, m.postcode, m.commune_code AS "communeCode",
             json_build_array(round(ST_X(m.point)::numeric, 6)::float8, round(ST_Y(m.point)::numeric, 6)::float8) AS position,
             round(${distance(center)})::int AS "distanceM", m.parcel_ids AS "parcelIds",
             coalesce((SELECT json_agg(json_build_object('id', p.id, 'geometry', ST_AsGeoJSON(p.geometry, 6)::json) ORDER BY p.id)
                       FROM parcels p WHERE p.id = ANY(m.parcel_ids)), '[]'::json) AS parcels
      FROM dvf_mutations m
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY m.date DESC, m.id
      LIMIT ${limit}`);
    return r.rows;
  }

  /** Communes des ventes du cercle (pour charger leur cadastre). */
  async communesWithin(center: readonly number[], radiusM: number): Promise<string[]> {
    const r = await this.db.execute<{ code: string }>(sql`SELECT DISTINCT m.commune_code AS code FROM dvf_mutations m WHERE ${circle(center, radiusM)} ORDER BY code`);
    return r.rows.map((x) => x.code);
  }

  async dvfCount(departmentCode: string): Promise<{ year: number; mutations: number }[]> {
    const r = await this.db.execute<{ year: number; mutations: number }>(sql`
      SELECT year, count(*)::int AS mutations FROM dvf_mutations WHERE department_code = ${departmentCode} GROUP BY year ORDER BY year`);
    return r.rows;
  }

  /** Remplace tout l'ECLN. */
  async replaceNewBuild(rows: readonly NewBuildRow[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(newBuildPrice);
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        await tx.insert(newBuildPrice).values(
          rows.slice(i, i + INSERT_CHUNK).map((r) => ({
            departmentCode: r.department,
            quarter: r.quarter,
            housingType: r.housingType,
            listed: r.listed,
            reservations: r.reservations,
            cancellations: r.cancellations,
            stock: r.stock,
            monthsToSell: r.monthsToSell,
            pricePerSqm: r.pricePerM2,
            averagePrice: r.averagePrice,
          })),
        );
      }
    });
  }

  /** Les `quarters` derniers trimestres publiés d'un département. */
  async newBuild(departmentCode: string, quarters: number) {
    const latest = await this.db
      .selectDistinct({ quarter: newBuildPrice.quarter })
      .from(newBuildPrice)
      .where(eq(newBuildPrice.departmentCode, departmentCode))
      .orderBy(desc(newBuildPrice.quarter))
      .limit(quarters);
    if (latest.length === 0) return [];
    return this.db
      .select()
      .from(newBuildPrice)
      .where(and(eq(newBuildPrice.departmentCode, departmentCode), inArray(newBuildPrice.quarter, latest.map((q) => q.quarter))))
      .orderBy(desc(newBuildPrice.quarter), asc(newBuildPrice.housingType));
  }

  async replaceIndices(series: ReadonlyMap<string, readonly IndexValue[]>): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [id, values] of series) {
        await tx.delete(indexValue).where(eq(indexValue.series, id));
        if (values.length > 0) await tx.insert(indexValue).values(values.map((v) => ({ series: id, period: v.period, value: v.value })));
      }
    });
  }

  async indexValues(ids: readonly string[]): Promise<Map<string, IndexValue[]>> {
    const out = new Map<string, IndexValue[]>(ids.map((id) => [id, []]));
    if (ids.length === 0) return out;
    const rows = await this.db.select().from(indexValue).where(inArray(indexValue.series, [...ids])).orderBy(asc(indexValue.period));
    for (const r of rows) out.get(r.series)!.push({ period: r.period, value: r.value });
    return out;
  }

  async replacePermits(communeCode: string, rows: readonly PermitRow[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(housingPermit).where(eq(housingPermit.communeCode, communeCode));
      if (rows.length > 0) await tx.insert(housingPermit).values(rows.map(({ communeCode: c, ...r }) => ({ communeCode: c, ...r })));
    });
  }

  async permits(communeCode: string, fromYear: number) {
    return this.db
      .select()
      .from(housingPermit)
      .where(and(eq(housingPermit.communeCode, communeCode), sql`${housingPermit.year} >= ${fromYear}`))
      .orderBy(desc(housingPermit.year), asc(housingPermit.housingType));
  }
}
