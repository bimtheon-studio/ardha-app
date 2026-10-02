// Données communales de Géorisques gardées en base (F-04) : une ligne par commune et par donnée.
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DB, type Db } from '../db/db.ts';
import { communeRisk } from '../db/schema.ts';

@Injectable()
export class CommuneRisksRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async get(communeCode: string, part: string): Promise<{ data: unknown; fetchedAt: Date } | undefined> {
    const [r] = await this.db
      .select({ data: communeRisk.data, fetchedAt: communeRisk.fetchedAt })
      .from(communeRisk)
      .where(and(eq(communeRisk.communeCode, communeCode), eq(communeRisk.part, part)));
    return r;
  }

  async save(communeCode: string, part: string, data: unknown, fetchedAt: Date): Promise<void> {
    await this.db
      .insert(communeRisk)
      .values({ communeCode, part, data, fetchedAt })
      .onConflictDoUpdate({ target: [communeRisk.communeCode, communeRisk.part], set: { data, fetchedAt } });
  }
}
