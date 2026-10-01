// Ce que fait `pnpm server …` (lot LD, étape 4), calculé sans effet : copier les fichiers du serveur,
// construire ou publier l'image, appeler `ardha-env` par SSH. L'exécution est dans `cli.ts`.

export type Action =
  | { kind: 'sync' }
  | { kind: 'build'; image: string }
  | { kind: 'push'; image: string }
  | { kind: 'remote'; args: string[]; tty: boolean; secret?: string };

export interface PlanContext {
  /** Dépôt de l'image, sans étiquette (`ghcr.io/bimtheon-studio/ardha`). */
  repository: string;
  /** Commit courant (SHA complet). */
  sha: string;
  /** Modifications non commitées : l'image du commit ne les contiendrait pas. */
  dirty: boolean;
  /** Entrée standard sur un terminal (logs suivis, psql, exec interactif). */
  tty: boolean;
}

export const USAGE = `Usage : pnpm server <commande>
  setup                                   copie les fichiers du serveur, installe Postgres et Redis
  registry --username <u>                 jeton ghcr.io (read:packages) pour once, demandé sans écho
  team-set --email <e> --name <nom>       compte d'équipe, mot de passe demandé sans écho (liste sur le serveur)
  team-list                               comptes d'équipe (sans les mots de passe)
  team-remove --email <e>
  accounts <nom>                          crée les comptes d'équipe manquants dans un environnement
  sync                                    copie seulement les fichiers du serveur (~/ardha)
  image [--push]                          construit l'image du commit courant ; --push la publie
  create <nom> [--image <image>]          crée un environnement (production, pr-<n>)
  update <nom> [--image <image>] [--reset-db]
  remove <nom> [--confirm production]
  list                                    environnements, hôtes, états, images
  logs <nom> [--tail <n>] [--follow]
  exec <nom> <commande…>                  par ex. exec pr-12 ardha user:list
  psql <nom> [arguments de psql…]
Image par défaut : celle du commit courant (<dépôt>:sha-<7>), publiée par la CI ou par « image --push ».`;

/** Étiquette immuable de l'image d'un commit, la même que celle de la CI (`sha-<7 caractères>`). */
export function imageFor(ctx: Pick<PlanContext, 'repository' | 'sha'>): string {
  return `${ctx.repository}:sha-${ctx.sha.slice(0, 7)}`;
}

/** Argument pour un shell POSIX (ssh concatène les arguments et les confie au shell distant). */
export function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_\-.,:/=@%+]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}

function commitImage(ctx: PlanContext): string {
  if (ctx.dirty) {
    throw new Error("Des modifications non commitées : l'image du commit ne les contiendrait pas. Committer, ou passer --image.");
  }
  return imageFor(ctx);
}

export function plan(argv: string[], ctx: PlanContext): Action[] {
  const [command, ...rest] = argv;
  const remote = (args: string[], tty = false): Action => ({ kind: 'remote', args, tty });
  const name = () => {
    if (!rest[0] || rest[0].startsWith('-')) throw new Error(`nom d’environnement manquant\n\n${USAGE}`);
    return rest[0];
  };
  switch (command) {
    case 'sync':
      return [{ kind: 'sync' }];
    case 'setup':
      return [{ kind: 'sync' }, remote(['setup'])];
    case 'registry': {
      const i = rest.indexOf('--username');
      const username = i >= 0 ? rest[i + 1] : undefined;
      if (!username) throw new Error(`--username manquant\n\n${USAGE}`);
      return [{ kind: 'sync' }, { kind: 'remote', args: ['registry', '--username', username], tty: false, secret: 'Jeton ghcr.io (read:packages) : ' }];
    }
    case 'team-set':
      return [{ kind: 'sync' }, { kind: 'remote', args: ['team-set', ...rest], tty: false, secret: 'Mot de passe du compte : ' }];
    case 'team-list':
    case 'team-remove':
      return [remote([command, ...rest])];
    case 'accounts':
      name();
      return [remote([command, ...rest])];
    case 'image': {
      const image = commitImage(ctx);
      return rest.includes('--push') ? [{ kind: 'build', image }, { kind: 'push', image }] : [{ kind: 'build', image }];
    }
    case 'create':
    case 'update': {
      name();
      const args = rest.includes('--image') ? rest : [...rest.slice(0, 1), '--image', commitImage(ctx), ...rest.slice(1)];
      return [{ kind: 'sync' }, remote([command, ...args])];
    }
    case 'remove':
      name();
      return [remote([command, ...rest])];
    case 'list':
      return [remote(['list'])];
    case 'logs':
    case 'exec':
    case 'psql':
      name();
      return [remote([command, ...rest], ctx.tty)];
    default:
      throw new Error(USAGE);
  }
}
