// Doctrine « base bête » (PLAN §3) : tables, types, index, clés, UNIQUE, NOT NULL. Jamais de
// trigger, de fonction SQL, de policy, de règle, de pg_cron. Deux contrôles :
//  - statique, sur le texte des migrations (sans base) ;
//  - sur le schéma d'une base migrée (voir `introspection.ts`), qui attrape ce que le texte cache.

/** Extensions autorisées : elles apportent des types et des fonctions de bibliothèque, pas de logique à nous. */
export const EXTENSIONS_AUTORISEES = ['plpgsql', 'postgis', 'vector'] as const;

export interface Violation {
  fichier: string;
  ligne: number;
  regle: string;
  extrait: string;
}

interface Regle {
  nom: string;
  motif: RegExp;
}

const REGLES: Regle[] = [
  { nom: 'fonction ou procédure SQL', motif: /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b/gi },
  { nom: 'trigger', motif: /\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+|event\s+)?trigger\b/gi },
  { nom: 'policy (RLS)', motif: /\bcreate\s+policy\b/gi },
  { nom: 'sécurité au niveau des lignes (RLS)', motif: /\b(?:enable|force)\s+row\s+level\s+security\b/gi },
  { nom: 'règle de réécriture', motif: /\bcreate\s+(?:or\s+replace\s+)?rule\b/gi },
  { nom: 'agrégat, opérateur ou langage', motif: /\bcreate\s+(?:or\s+replace\s+)?(?:aggregate|operator|(?:trusted\s+)?(?:procedural\s+)?language)\b/gi },
  { nom: 'bloc de code anonyme (DO)', motif: /(?:^|;)\s*do\s+(?:language\s+\w+\s+)?(?:\$|')/gi },
  { nom: 'appel de procédure (CALL)', motif: /(?:^|;)\s*call\s+\w/gi },
  { nom: 'pg_cron', motif: /\bcron\s*\.\s*\w+|\bpg_cron\b/gi },
];

const EXTENSION = /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?"?([\w-]+)"?/gi;

/**
 * Remplace commentaires et littéraux par des espaces, en gardant les retours à la ligne : les
 * numéros de ligne restent justes, et un mot interdit dans un commentaire ne déclenche rien.
 * Les littéraux à dollars (`$$…$$`, `$corps$…$corps$`) sont vidés aussi : leur ouverture reste
 * visible, et c'est la commande qui les porte (`CREATE FUNCTION`, `DO`) qui est interdite.
 */
export function neutraliser(sql: string): string {
  let sortie = '';
  let i = 0;
  const blanc = (texte: string) => texte.replace(/[^\n]/g, ' ');
  while (i < sql.length) {
    const reste = sql.slice(i);
    let fin = -1;
    if (reste.startsWith('--')) {
      fin = reste.indexOf('\n');
      fin = fin === -1 ? reste.length : fin;
    } else if (reste.startsWith('/*')) {
      fin = reste.indexOf('*/');
      fin = fin === -1 ? reste.length : fin + 2;
    } else if (reste[0] === "'") {
      const m = /^'(?:[^']|'')*'?/.exec(reste);
      fin = m ? m[0].length : 1;
      sortie += "'" + blanc(reste.slice(1, fin)) ;
      i += fin;
      continue;
    } else {
      const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(reste);
      if (dollar) {
        const balise = dollar[0];
        const ferme = reste.indexOf(balise, balise.length);
        fin = ferme === -1 ? reste.length : ferme + balise.length;
        sortie += balise + blanc(reste.slice(balise.length, fin));
        i += fin;
        continue;
      }
    }
    if (fin >= 0) {
      sortie += blanc(reste.slice(0, fin));
      i += fin;
    } else {
      sortie += sql[i];
      i += 1;
    }
  }
  return sortie;
}

function numeroDeLigne(texte: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (texte.charCodeAt(i) === 10) n++;
  return n;
}

function extraitDeLigne(sql: string, ligne: number): string {
  return (sql.split('\n')[ligne - 1] ?? '').trim().slice(0, 120);
}

/** Contrôle statique d'un fichier de migration. */
export function analyserMigration(fichier: string, sql: string): Violation[] {
  const neutre = neutraliser(sql);
  const violations: Violation[] = [];
  const signaler = (index: number, regle: string) => {
    const ligne = numeroDeLigne(neutre, index);
    violations.push({ fichier, ligne, regle, extrait: extraitDeLigne(sql, ligne) });
  };
  for (const { nom, motif } of REGLES) {
    for (const m of neutre.matchAll(motif)) signaler(m.index + Math.max(0, m[0].search(/[a-z]/i)), nom);
  }
  for (const m of neutre.matchAll(EXTENSION)) {
    const nom = (m[1] ?? '').toLowerCase();
    if (!(EXTENSIONS_AUTORISEES as readonly string[]).includes(nom)) {
      signaler(m.index, `extension non autorisée (${nom})`);
    }
  }
  return violations.sort((a, b) => a.ligne - b.ligne);
}
