// Intégration : le contrôle du schéma, sur une base jetable du Postgres local (ou de la CI).
import { randomBytes } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkSchema } from './introspection.ts';
import { testUrl } from './test-url.ts';

const url = testUrl();
const name = `doctrine_${randomBytes(4).toString('hex')}`;
let admin: pg.Client;
let db: pg.Client;

describe.skipIf(!url)('analyserSchema (base réelle)', () => {
  beforeAll(async () => {
    // Par la base de maintenance : une session ouverte sur la base modèle des tests d'intégration
    // (`ardha_test`) ferait échouer leur clonage (« source database is being accessed by other users »).
    const maintenance = new URL(url!);
    maintenance.pathname = '/postgres';
    admin = new pg.Client({ connectionString: maintenance.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    const target = new URL(url!);
    target.pathname = `/${name}`;
    db = new pg.Client({ connectionString: target.toString() });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin?.end();
  });

  it('une base avec PostGIS, pgvector et des tables est conforme', async () => {
    await db.query('CREATE EXTENSION postgis; CREATE EXTENSION vector;');
    await db.query('CREATE TABLE t (id int PRIMARY KEY, g geometry(Point, 4326), v vector(3))');
    expect(await checkSchema(db)).toEqual([]);
  });

  it('voit une fonction, un trigger, une policy, la RLS et une règle', async () => {
    await db.query(`
      CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER tr BEFORE INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();
      ALTER TABLE t ENABLE ROW LEVEL SECURITY;
      CREATE POLICY p ON t USING (true);
      CREATE TABLE journal (id int);
      CREATE RULE r AS ON INSERT TO journal DO INSTEAD NOTHING;
    `);
    const rules = (await checkSchema(db)).map((v) => `${v.rule} : ${v.item}`);
    expect(rules).toEqual([
      'fonction ou procédure SQL : public.f',
      'trigger : t.tr',
      'policy (RLS) : t.p',
      'sécurité au niveau des lignes (RLS) : public.t',
      'règle de réécriture : public.journal.r',
    ]);
  });
});
