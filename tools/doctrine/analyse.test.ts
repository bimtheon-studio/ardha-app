import { describe, expect, it } from 'vitest';

import { analyserMigration, neutraliser } from './analyse.ts';

const regles = (sql: string) => analyserMigration('m.sql', sql).map((v) => v.regle);

describe('analyserMigration — ce qui est permis', () => {
  it('laisse passer tables, index, clés, contraintes, types', () => {
    const sql = `
      CREATE TYPE "role" AS ENUM ('admin', 'utilisateur');
      CREATE TABLE "utilisateur" ("id" uuid PRIMARY KEY DEFAULT uuidv7(), "email" text NOT NULL UNIQUE);
      CREATE INDEX "i" ON "utilisateur" USING btree ("email");
      ALTER TABLE "session" ADD CONSTRAINT "fk" FOREIGN KEY ("u") REFERENCES "utilisateur"("id") ON DELETE cascade;
      CREATE EXTENSION IF NOT EXISTS postgis;
      CREATE EXTENSION IF NOT EXISTS "vector";
    `;
    expect(regles(sql)).toEqual([]);
  });

  it('ignore les mots interdits dans les commentaires et les chaînes', () => {
    const sql = `
      -- pas de CREATE FUNCTION ici
      /* ni de CREATE TRIGGER
         sur plusieurs lignes */
      COMMENT ON TABLE "t" IS 'on ne met jamais de create policy ; ni de do $$';
    `;
    expect(regles(sql)).toEqual([]);
  });

  it('ne confond pas un nom de colonne avec une commande', () => {
    expect(regles(`CREATE TABLE "t" ("do" text, "call" text, "trigger_at" timestamptz);`)).toEqual([]);
  });
});

describe('analyserMigration — ce qui est refusé', () => {
  it.each([
    ['CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;', 'fonction ou procédure SQL'],
    ['create or replace function f() returns int language sql as $$select 1$$;', 'fonction ou procédure SQL'],
    ['CREATE PROCEDURE p() LANGUAGE sql AS $$ SELECT 1 $$;', 'fonction ou procédure SQL'],
    ['CREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW EXECUTE FUNCTION f();', 'trigger'],
    ['CREATE CONSTRAINT TRIGGER t AFTER INSERT ON x FOR EACH ROW EXECUTE FUNCTION f();', 'trigger'],
    ['CREATE EVENT TRIGGER e ON ddl_command_start EXECUTE FUNCTION f();', 'trigger'],
    ['CREATE POLICY p ON x USING (true);', 'policy (RLS)'],
    ['ALTER TABLE x ENABLE ROW LEVEL SECURITY;', 'sécurité au niveau des lignes (RLS)'],
    ['ALTER TABLE x FORCE ROW LEVEL SECURITY;', 'sécurité au niveau des lignes (RLS)'],
    ['CREATE RULE r AS ON INSERT TO x DO INSTEAD NOTHING;', 'règle de réécriture'],
    ['DO $$ BEGIN PERFORM 1; END $$;', 'bloc de code anonyme (DO)'],
    ["SELECT 1;\nDO LANGUAGE plpgsql 'BEGIN END';", 'bloc de code anonyme (DO)'],
    ['CALL p();', 'appel de procédure (CALL)'],
    ["SELECT cron.schedule('x', '* * * * *', 'SELECT 1');", 'pg_cron'],
    ['CREATE AGGREGATE a (int) (sfunc = f, stype = int);', 'agrégat, opérateur ou langage'],
  ])('%s', (sql, regle) => {
    expect(regles(sql)).toContain(regle);
  });

  it('refuse une extension hors liste, dont pg_cron', () => {
    expect(regles('CREATE EXTENSION pg_cron;')).toEqual(['pg_cron', 'extension non autorisée (pg_cron)']);
    expect(regles('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')).toEqual(['extension non autorisée (uuid-ossp)']);
  });

  it('donne le numéro de ligne et un extrait', () => {
    const [v] = analyserMigration('0001.sql', 'CREATE TABLE t (id int);\n\n  CREATE TRIGGER x AFTER INSERT ON t EXECUTE FUNCTION f();');
    expect(v).toMatchObject({ fichier: '0001.sql', ligne: 3, regle: 'trigger' });
    expect(v?.extrait).toMatch(/^CREATE TRIGGER x/);
  });

  it('voit une fonction malgré un corps à balise nommée', () => {
    expect(regles('CREATE FUNCTION f() RETURNS int AS $corps$ SELECT 1 $corps$ LANGUAGE sql;')).toEqual([
      'fonction ou procédure SQL',
    ]);
  });
});

describe('neutraliser', () => {
  it('garde la longueur et les retours à la ligne', () => {
    const sql = "SELECT 'a''b' -- c\n/* d\ne */ $x$ f $x$;";
    const n = neutraliser(sql);
    expect(n).toHaveLength(sql.length);
    expect(n.split('\n')).toHaveLength(sql.split('\n').length);
    expect(n).not.toMatch(/[bcdf]/);
  });
});
