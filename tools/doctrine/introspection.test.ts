// Intégration : le contrôle du schéma, sur une base jetable du Postgres local (ou de la CI).
import { randomBytes } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { analyserSchema } from './introspection.ts';
import { urlDeTest } from './test-url.ts';

const url = urlDeTest();
const nom = `doctrine_${randomBytes(4).toString('hex')}`;
let admin: pg.Client;
let base: pg.Client;

describe.skipIf(!url)('analyserSchema (base réelle)', () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${nom}`);
    const cible = new URL(url!);
    cible.pathname = `/${nom}`;
    base = new pg.Client({ connectionString: cible.toString() });
    await base.connect();
  });

  afterAll(async () => {
    await base?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`);
    await admin?.end();
  });

  it('une base avec PostGIS, pgvector et des tables est conforme', async () => {
    await base.query('CREATE EXTENSION postgis; CREATE EXTENSION vector;');
    await base.query('CREATE TABLE t (id int PRIMARY KEY, g geometry(Point, 4326), v vector(3))');
    expect(await analyserSchema(base)).toEqual([]);
  });

  it('voit une fonction, un trigger, une policy, la RLS et une règle', async () => {
    await base.query(`
      CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER tr BEFORE INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();
      ALTER TABLE t ENABLE ROW LEVEL SECURITY;
      CREATE POLICY p ON t USING (true);
      CREATE TABLE journal (id int);
      CREATE RULE r AS ON INSERT TO journal DO INSTEAD NOTHING;
    `);
    const regles = (await analyserSchema(base)).map((v) => `${v.regle} : ${v.objet}`);
    expect(regles).toEqual([
      'fonction ou procédure SQL : public.f',
      'trigger : t.tr',
      'policy (RLS) : t.p',
      'sécurité au niveau des lignes (RLS) : public.t',
      'règle de réécriture : public.journal.r',
    ]);
  });
});
