// `pnpm doctrine [--base [url]]` : contrôle « base bête » des migrations, et du schéma d'une base
// migrée si `--base` est donné (sans URL : `DATABASE_URL`, sinon celle de `.env.local`).
// Code de sortie 1 s'il y a la moindre violation.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import { checkMigration, type Violation } from './analysis.ts';
import { checkSchema } from './introspection.ts';
import { parseEnv } from '../stack/files.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MIGRATIONS_DIR = path.join(ROOT, 'drizzle');

function sqlFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

function localUrl(): string | undefined {
  const file = path.join(ROOT, '.env.local');
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')).get('DATABASE_URL') : undefined;
}

async function main(): Promise<number> {
  const files = sqlFiles(MIGRATIONS_DIR);
  const violations: Violation[] = files.flatMap((f) =>
    checkMigration(path.relative(ROOT, f), readFileSync(f, 'utf8')),
  );
  for (const v of violations) console.error(`${v.file}:${v.line} — ${v.rule}\n    ${v.excerpt}`);
  console.log(`Migrations : ${files.length} fichier(s), ${violations.length} violation(s).`);

  const i = process.argv.indexOf('--base');
  let schemaViolations = 0;
  if (i !== -1) {
    const url = process.argv[i + 1] ?? process.env.DATABASE_URL ?? localUrl();
    if (!url) throw new Error('--base : aucune URL (argument, DATABASE_URL ou .env.local).');
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const vs = await checkSchema(client);
      for (const v of vs) console.error(`base — ${v.rule} : ${v.item}`);
      schemaViolations = vs.length;
      console.log(`Schéma : ${vs.length} violation(s).`);
    } finally {
      await client.end();
    }
  }
  return violations.length + schemaViolations > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  },
);
