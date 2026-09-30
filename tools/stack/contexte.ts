// Contexte de la copie de travail : clone principal ou worktree, branche, ports, nom du projet Compose.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

import { decalageDeBranche, portsDecales, type Ports } from './ports.ts';

export interface Contexte {
  racine: string;
  estWorktree: boolean;
  branche: string;
  /** Nom du projet Compose : préfixe des conteneurs et des volumes. */
  projet: string;
  decalage: number;
  ports: Ports;
  /** Nom du cookie de session : un cookie ignore le port, deux stacks sur 127.0.0.1 se le disputeraient. */
  cookieSession: string;
}

export interface InfosGit {
  racine: string;
  /** Sortie de `git rev-parse --git-common-dir`, relative à `racine` ou absolue. */
  dossierCommun: string;
  branche: string;
}

/** Nom de projet Compose valide : minuscules, chiffres, `-` et `_`, commençant par une lettre ou un chiffre. */
export function nomDeProjet(dossier: string): string {
  const nom = dossier.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+/, '');
  return nom || 'ardha';
}

/**
 * Déduit le contexte des infos git. `decalageForce` (variable `ARDHA_PORT_OFFSET`) permet de sortir
 * d'une collision de ports sans changer de branche.
 */
export function contexteDepuis(git: InfosGit, decalageForce?: number): Contexte {
  const racine = path.resolve(git.racine);
  const commun = path.isAbsolute(git.dossierCommun)
    ? git.dossierCommun
    : path.resolve(racine, git.dossierCommun);
  const racinePrincipale = path.dirname(commun);
  const estWorktree = reel(racine) !== reel(racinePrincipale);
  const projet = nomDeProjet(path.basename(racine));
  const decalage = decalageForce ?? (estWorktree ? decalageDeBranche(git.branche) : 0);
  return {
    racine,
    estWorktree,
    branche: git.branche,
    projet,
    decalage,
    ports: portsDecales(decalage),
    cookieSession: estWorktree ? `ardha_session_${projet.replace(/-/g, '_')}` : 'ardha_session',
  };
}

export function lireDecalageForce(valeur: string | undefined): number | undefined {
  if (valeur === undefined || valeur === '') return undefined;
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < 0 || n > 404) {
    throw new Error(`ARDHA_PORT_OFFSET doit être un entier entre 0 et 404 (reçu « ${valeur} »).`);
  }
  return n;
}

export function contexteCourant(dossier = process.cwd()): Contexte {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', dossier, ...args], { encoding: 'utf8' }).trim();
  return contexteDepuis(
    {
      racine: git('rev-parse', '--show-toplevel'),
      dossierCommun: git('rev-parse', '--git-common-dir'),
      branche: git('rev-parse', '--abbrev-ref', 'HEAD'),
    },
    lireDecalageForce(process.env.ARDHA_PORT_OFFSET),
  );
}

function reel(chemin: string): string {
  try {
    return realpathSync(chemin);
  } catch {
    return chemin;
  }
}
