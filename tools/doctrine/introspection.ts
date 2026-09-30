// Contrôle de la doctrine sur le schéma d'une base migrée : ce que le texte des migrations
// pourrait cacher (SQL dynamique, extension qui crée des objets) se voit dans le catalogue.
import { ALLOWED_EXTENSIONS } from './analysis.ts';

export interface Queryable {
  query<T>(sql: string): Promise<{ rows: T[] }>;
}

interface Check {
  name: string;
  sql: string;
}

const NON_SYSTEM = `n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'`;

/** Objet membre d'une extension (fonctions de PostGIS, de pgvector…) : toléré. */
const EXTENSION_MEMBER = (classOid: string, oid: string) =>
  `EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = '${classOid}'::regclass AND d.objid = ${oid} AND d.deptype = 'e')`;

const CHECKS: Check[] = [
  {
    name: 'fonction ou procédure SQL',
    sql: `SELECT n.nspname || '.' || p.proname AS item FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE ${NON_SYSTEM} AND NOT ${EXTENSION_MEMBER('pg_proc', 'p.oid')}`,
  },
  {
    name: 'trigger',
    sql: `SELECT c.relname || '.' || t.tgname AS item FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE NOT t.tgisinternal`,
  },
  { name: 'trigger d’événement', sql: `SELECT evtname AS item FROM pg_event_trigger` },
  {
    name: 'policy (RLS)',
    sql: `SELECT c.relname || '.' || p.polname AS item FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid`,
  },
  {
    name: 'sécurité au niveau des lignes (RLS)',
    sql: `SELECT n.nspname || '.' || c.relname AS item FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE ${NON_SYSTEM} AND (c.relrowsecurity OR c.relforcerowsecurity)`,
  },
  {
    // Les règles des vues d'une extension (`geometry_columns` de PostGIS) sont tolérées.
    name: 'règle de réécriture',
    sql: `SELECT n.nspname || '.' || c.relname || '.' || r.rulename AS item FROM pg_rewrite r
          JOIN pg_class c ON c.oid = r.ev_class JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE r.rulename <> '_RETURN' AND ${NON_SYSTEM} AND NOT ${EXTENSION_MEMBER('pg_class', 'c.oid')}`,
  },
  {
    name: 'extension non autorisée',
    sql: `SELECT extname AS item FROM pg_extension
          WHERE extname NOT IN (${ALLOWED_EXTENSIONS.map((e) => `'${e}'`).join(', ')})`,
  },
];

export interface SchemaViolation {
  rule: string;
  item: string;
}

export async function checkSchema(db: Queryable): Promise<SchemaViolation[]> {
  const violations: SchemaViolation[] = [];
  for (const { name, sql } of CHECKS) {
    const { rows } = await db.query<{ item: string }>(sql);
    for (const { item } of rows) violations.push({ rule: name, item });
  }
  return violations;
}
