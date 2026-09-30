// Contexte de la copie de travail : clone principal ou worktree, branche, ports, nom du projet Compose.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

import { branchOffset, offsetPorts, type Ports } from './ports.ts';

export interface Context {
  root: string;
  isWorktree: boolean;
  branch: string;
  /** Nom du projet Compose : préfixe des conteneurs et des volumes. */
  project: string;
  offset: number;
  ports: Ports;
  /** Nom du cookie de session : un cookie ignore le port, deux stacks sur 127.0.0.1 se le disputeraient. */
  cookieSession: string;
}

export interface GitInfo {
  root: string;
  /** Sortie de `git rev-parse --git-common-dir`, relative à `root` ou absolue. */
  commonDir: string;
  branch: string;
}

/** Nom de projet Compose valide : minuscules, chiffres, `-` et `_`, commençant par une lettre ou un chiffre. */
export function projectName(dir: string): string {
  const name = dir.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+/, '');
  return name || 'ardha';
}

/**
 * Déduit le contexte des infos git. `forcedOffset` (variable `ARDHA_PORT_OFFSET`) permet de sortir
 * d'une collision de ports sans changer de branche.
 */
export function contextFrom(git: GitInfo, forcedOffset?: number): Context {
  const root = path.resolve(git.root);
  const common = path.isAbsolute(git.commonDir)
    ? git.commonDir
    : path.resolve(root, git.commonDir);
  const mainRoot = path.dirname(common);
  const isWorktree = real(root) !== real(mainRoot);
  const project = projectName(path.basename(root));
  const offset = forcedOffset ?? (isWorktree ? branchOffset(git.branch) : 0);
  return {
    root,
    isWorktree,
    branch: git.branch,
    project,
    offset,
    ports: offsetPorts(offset),
    cookieSession: isWorktree ? `ardha_session_${project.replace(/-/g, '_')}` : 'ardha_session',
  };
}

export function readForcedOffset(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 404) {
    throw new Error(`ARDHA_PORT_OFFSET doit être un entier entre 0 et 404 (reçu « ${value} »).`);
  }
  return n;
}

export function currentContext(dir = process.cwd()): Context {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  return contextFrom(
    {
      root: git('rev-parse', '--show-toplevel'),
      commonDir: git('rev-parse', '--git-common-dir'),
      branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    },
    readForcedOffset(process.env.ARDHA_PORT_OFFSET),
  );
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
