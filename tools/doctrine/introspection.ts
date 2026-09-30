// Contrôle de la doctrine sur le schéma d'une base migrée : ce que le texte des migrations
// pourrait cacher (SQL dynamique, extension qui crée des objets) se voit dans le catalogue.
import { EXTENSIONS_AUTORISEES } from './analyse.ts';

export interface Requeteur {
  query<T>(sql: string): Promise<{ rows: T[] }>;
}

interface Controle {
  nom: string;
  sql: string;
}

const HORS_SYSTEME = `n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'`;

/** Objet membre d'une extension (fonctions de PostGIS, de pgvector…) : toléré. */
const DEPEND_D_UNE_EXTENSION = (classe: string, oid: string) =>
  `EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = '${classe}'::regclass AND d.objid = ${oid} AND d.deptype = 'e')`;

const CONTROLES: Controle[] = [
  {
    nom: 'fonction ou procédure SQL',
    sql: `SELECT n.nspname || '.' || p.proname AS objet FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE ${HORS_SYSTEME} AND NOT ${DEPEND_D_UNE_EXTENSION('pg_proc', 'p.oid')}`,
  },
  {
    nom: 'trigger',
    sql: `SELECT c.relname || '.' || t.tgname AS objet FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE NOT t.tgisinternal`,
  },
  { nom: 'trigger d’événement', sql: `SELECT evtname AS objet FROM pg_event_trigger` },
  {
    nom: 'policy (RLS)',
    sql: `SELECT c.relname || '.' || p.polname AS objet FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid`,
  },
  {
    nom: 'sécurité au niveau des lignes (RLS)',
    sql: `SELECT n.nspname || '.' || c.relname AS objet FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE ${HORS_SYSTEME} AND (c.relrowsecurity OR c.relforcerowsecurity)`,
  },
  {
    // Les règles des vues d'une extension (`geometry_columns` de PostGIS) sont tolérées.
    nom: 'règle de réécriture',
    sql: `SELECT n.nspname || '.' || c.relname || '.' || r.rulename AS objet FROM pg_rewrite r
          JOIN pg_class c ON c.oid = r.ev_class JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE r.rulename <> '_RETURN' AND ${HORS_SYSTEME} AND NOT ${DEPEND_D_UNE_EXTENSION('pg_class', 'c.oid')}`,
  },
  {
    nom: 'extension non autorisée',
    sql: `SELECT extname AS objet FROM pg_extension
          WHERE extname NOT IN (${EXTENSIONS_AUTORISEES.map((e) => `'${e}'`).join(', ')})`,
  },
];

export interface ViolationSchema {
  regle: string;
  objet: string;
}

export async function analyserSchema(base: Requeteur): Promise<ViolationSchema[]> {
  const violations: ViolationSchema[] = [];
  for (const { nom, sql } of CONTROLES) {
    const { rows } = await base.query<{ objet: string }>(sql);
    for (const { objet } of rows) violations.push({ regle: nom, objet });
  }
  return violations;
}
