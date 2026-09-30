// Doctrine « base bête » (PLAN §3) : tables, types, index, clés, UNIQUE, NOT NULL. Jamais de
// trigger, de fonction SQL, de policy, de règle, de pg_cron. Deux contrôles :
//  - statique, sur le texte des migrations (sans base) ;
//  - sur le schéma d'une base migrée (voir `introspection.ts`), qui attrape ce que le texte cache.

/** Extensions autorisées : elles apportent des types et des fonctions de bibliothèque, pas de logique à nous. */
export const ALLOWED_EXTENSIONS = ['plpgsql', 'postgis', 'vector'] as const;

export interface Violation {
  file: string;
  line: number;
  rule: string;
  excerpt: string;
}

interface Rule {
  name: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  { name: 'fonction ou procédure SQL', pattern: /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b/gi },
  { name: 'trigger', pattern: /\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+|event\s+)?trigger\b/gi },
  { name: 'policy (RLS)', pattern: /\bcreate\s+policy\b/gi },
  { name: 'sécurité au niveau des lignes (RLS)', pattern: /\b(?:enable|force)\s+row\s+level\s+security\b/gi },
  { name: 'règle de réécriture', pattern: /\bcreate\s+(?:or\s+replace\s+)?rule\b/gi },
  { name: 'agrégat, opérateur ou langage', pattern: /\bcreate\s+(?:or\s+replace\s+)?(?:aggregate|operator|(?:trusted\s+)?(?:procedural\s+)?language)\b/gi },
  { name: 'bloc de code anonyme (DO)', pattern: /(?:^|;)\s*do\s+(?:language\s+\w+\s+)?(?:\$|')/gi },
  { name: 'appel de procédure (CALL)', pattern: /(?:^|;)\s*call\s+\w/gi },
  { name: 'pg_cron', pattern: /\bcron\s*\.\s*\w+|\bpg_cron\b/gi },
];

const EXTENSION = /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?"?([\w-]+)"?/gi;

/**
 * Remplace commentaires et littéraux par des espaces, en gardant les retours à la ligne : les
 * numéros de ligne restent justes, et un mot interdit dans un commentaire ne déclenche rien.
 * Les littéraux à dollars (`$$…$$`, `$corps$…$corps$`) sont vidés aussi : leur ouverture reste
 * visible, et c'est la commande qui les porte (`CREATE FUNCTION`, `DO`) qui est interdite.
 */
export function neutralize(sql: string): string {
  let output = '';
  let i = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  while (i < sql.length) {
    const rest = sql.slice(i);
    let end = -1;
    if (rest.startsWith('--')) {
      end = rest.indexOf('\n');
      end = end === -1 ? rest.length : end;
    } else if (rest.startsWith('/*')) {
      end = rest.indexOf('*/');
      end = end === -1 ? rest.length : end + 2;
    } else if (rest[0] === "'") {
      const m = /^'(?:[^']|'')*'?/.exec(rest);
      end = m ? m[0].length : 1;
      output += "'" + blank(rest.slice(1, end)) ;
      i += end;
      continue;
    } else {
      const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(rest);
      if (dollar) {
        const tag = dollar[0];
        const closeIdx = rest.indexOf(tag, tag.length);
        end = closeIdx === -1 ? rest.length : closeIdx + tag.length;
        output += tag + blank(rest.slice(tag.length, end));
        i += end;
        continue;
      }
    }
    if (end >= 0) {
      output += blank(rest.slice(0, end));
      i += end;
    } else {
      output += sql[i];
      i += 1;
    }
  }
  return output;
}

function lineNumber(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function lineExcerpt(sql: string, line: number): string {
  return (sql.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

/** Contrôle statique d'un fichier de migration. */
export function checkMigration(file: string, sql: string): Violation[] {
  const neutral = neutralize(sql);
  const violations: Violation[] = [];
  const report = (index: number, rule: string) => {
    const line = lineNumber(neutral, index);
    violations.push({ file, line, rule, excerpt: lineExcerpt(sql, line) });
  };
  for (const { name, pattern } of RULES) {
    for (const m of neutral.matchAll(pattern)) report(m.index + Math.max(0, m[0].search(/[a-z]/i)), name);
  }
  for (const m of neutral.matchAll(EXTENSION)) {
    const name = (m[1] ?? '').toLowerCase();
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(name)) {
      report(m.index, `extension non autorisée (${name})`);
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}
