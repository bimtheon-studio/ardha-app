// `pnpm doctrine [--base [url]]` : contrôle « base bête » des migrations, et du schéma d'une base
// migrée si `--base` est donné (sans URL : `DATABASE_URL`, sinon celle de `.env.local`).
// Code de sortie 1 s'il y a la moindre violation.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import { analyserMigration, type Violation } from './analysis.ts';
import { analyserSchema } from './introspection.ts';
import { lireEnv } from '../stack/files.ts';

const RACINE = path.resolve(import.meta.dirname, '../..');
const DOSSIER_MIGRATIONS = path.join(RACINE, 'drizzle');

function fichiersSql(dossier: string): string[] {
  return readdirSync(dossier, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

function urlLocale(): string | undefined {
  const fichier = path.join(RACINE, '.env.local');
  return existsSync(fichier) ? lireEnv(readFileSync(fichier, 'utf8')).get('DATABASE_URL') : undefined;
}

async function principal(): Promise<number> {
  const fichiers = fichiersSql(DOSSIER_MIGRATIONS);
  const violations: Violation[] = fichiers.flatMap((f) =>
    analyserMigration(path.relative(RACINE, f), readFileSync(f, 'utf8')),
  );
  for (const v of violations) console.error(`${v.fichier}:${v.ligne} — ${v.regle}\n    ${v.extrait}`);
  console.log(`Migrations : ${fichiers.length} fichier(s), ${violations.length} violation(s).`);

  const i = process.argv.indexOf('--base');
  let violationsSchema = 0;
  if (i !== -1) {
    const url = process.argv[i + 1] ?? process.env.DATABASE_URL ?? urlLocale();
    if (!url) throw new Error('--base : aucune URL (argument, DATABASE_URL ou .env.local).');
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const vs = await analyserSchema(client);
      for (const v of vs) console.error(`base — ${v.regle} : ${v.objet}`);
      violationsSchema = vs.length;
      console.log(`Schéma : ${vs.length} violation(s).`);
    } finally {
      await client.end();
    }
  }
  return violations.length + violationsSchema > 0 ? 1 : 0;
}

principal().then(
  (code) => process.exit(code),
  (erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exit(2);
  },
);
