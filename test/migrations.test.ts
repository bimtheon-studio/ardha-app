// Migrations jouées au démarrage de chaque conteneur (lot LD) : pendant un déploiement once, l'ancien
// et le nouveau conteneur, ou plusieurs commandes, peuvent les lancer ensemble. Un verrou consultatif
// de PostgreSQL les met en file : une seule session migre à la fois.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATION_LOCK, runMigrations } from '../src/db/db.ts';
import { testConfig } from './env.ts';

const config = testConfig();
let pool: pg.Pool;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: config.DATABASE_URL });
});
afterAll(() => pool.end());

describe('migrations sous verrou', () => {
  it('attendent qu’une autre session ait fini, puis passent', async () => {
    const other = new pg.Client({ connectionString: config.DATABASE_URL });
    await other.connect();
    try {
      await other.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
      let done = false;
      const migration = runMigrations(pool).then(() => (done = true));
      await new Promise((r) => setTimeout(r, 300));
      expect(done).toBe(false);
      await other.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
      await migration;
      expect(done).toBe(true);
    } finally {
      await other.end();
    }
  });

  it('se jouent en parallèle sans erreur, et rendent le verrou', async () => {
    await Promise.all([runMigrations(pool), runMigrations(pool), runMigrations(pool)]);
    const r = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_locks
       WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
    expect(r.rows[0]!.n).toBe(0);
  });
});
