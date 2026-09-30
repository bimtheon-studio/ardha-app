// `pnpm start | stop | destroy | status` : la stack locale, isolée par worktree (D-09).
//
// `start` reconnaît un worktree, décale les ports d'après la branche, génère
// `docker-compose.override.yaml` et `.env.local`, vérifie que les ports sont libres, lance les
// dépendances (Postgres, Redis, MinIO), joue les migrations et le seed, puis l'API, le worker et le
// front au premier plan (Ctrl-C les arrête ; les conteneurs restent). `--infra` s'arrête avant.
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { adresses, lien } from './addresses.ts';
import { contexteCourant, type Contexte } from './context.ts';
import { nouveauxSecrets, override, secretsExistants, upsertBloc, variables } from './files.ts';
import { portVraimentLibre } from './free-port.ts';
import { LIBELLES, type Service } from './ports.ts';

const SERVICES_DOCKER: Service[] = ['postgres', 'redis', 'minio', 'minioConsole'];
const SERVICES_LOCAUX: Service[] = ['api', 'web'];

function afficherContexte(ctx: Contexte): void {
  const titre = ctx.estWorktree
    ? `Worktree isolé « ${ctx.projet} » (branche ${ctx.branche}, décalage +${ctx.decalage})`
    : `Clone principal « ${ctx.projet} » (branche ${ctx.branche}, décalage +${ctx.decalage})`;
  console.log(`\n${titre}`);
  console.log(`  Cookie de session : ${ctx.cookieSession}\n`);
}

/** Adresses de la stack, cliquables ; avec `etat`, une pastille dit si chacune répond. */
async function afficherAdresses(ctx: Contexte, etat: boolean): Promise<void> {
  const terminal = Boolean(process.stdout.isTTY);
  for (const a of adresses(ctx)) {
    const pastille = etat ? ((await portVraimentLibre(ctx.ports[a.service])) ? '○ ' : '● ') : '';
    console.log(`  ${pastille}${a.libelle.padEnd(16)} ${lien(a.url, terminal)}`);
  }
  if (etat) console.log('\n  ● répond  ○ arrêté');
  console.log('');
}

function ecrireFichiers(ctx: Contexte): void {
  const fichierEnv = path.join(ctx.racine, '.env.local');
  const existant = existsSync(fichierEnv) ? readFileSync(fichierEnv, 'utf8') : '';
  const secrets = secretsExistants(existant) ?? nouveauxSecrets();
  writeFileSync(path.join(ctx.racine, 'docker-compose.override.yaml'), override(ctx, secrets));
  writeFileSync(fichierEnv, upsertBloc(existant, variables(ctx, secrets)));
  console.log('Fichiers générés : docker-compose.override.yaml, .env.local');
}

/** Ports hôtes déjà publiés par les conteneurs de ce projet Compose (un redémarrage les retrouve pris). */
function portsDuProjet(ctx: Contexte): Set<number> {
  const sortie = execFileSync(
    'docker',
    ['ps', '--filter', `label=com.docker.compose.project=${ctx.projet}`, '--format', '{{.Ports}}'],
    { encoding: 'utf8' },
  );
  return new Set([...sortie.matchAll(/:(\d+)->/g)].map((m) => Number(m[1])));
}

async function verifierPorts(ctx: Contexte, services: Service[]): Promise<void> {
  const nosPorts = portsDuProjet(ctx);
  const pris: string[] = [];
  for (const service of services) {
    const port = ctx.ports[service];
    if (nosPorts.has(port)) continue;
    if (!(await portVraimentLibre(port))) pris.push(`  ${LIBELLES[service]} : ${port}`);
  }
  if (pris.length > 0) {
    throw new Error(
      [
        'Ports déjà pris par un autre processus :',
        ...pris,
        '',
        'Deux branches peuvent tomber sur le même décalage. Libérez ces ports, ou forcez un autre décalage :',
        `  ARDHA_PORT_OFFSET=${ctx.decalage >= 404 ? 5 : ctx.decalage + 1} pnpm start`,
        '(à redonner à chaque démarrage : il n\'est pas mémorisé).',
      ].join('\n'),
    );
  }
}

function lancer(commande: string, args: string[], ctx: Contexte): void {
  const r = spawnSync(commande, args, { cwd: ctx.racine, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`Échec de \`${commande} ${args.join(' ')}\` (code ${r.status ?? r.signal}).`);
  }
}

function creerBucket(ctx: Contexte): void {
  lancer(
    'docker',
    [
      'compose', 'exec', '-T', 'minio', 'sh', '-c',
      'mc alias set local http://127.0.0.1:9000 ardha "$MINIO_ROOT_PASSWORD" >/dev/null && mc mb --ignore-existing local/ardha',
    ],
    ctx,
  );
}

async function demarrer(ctx: Contexte, infraSeule: boolean): Promise<void> {
  afficherContexte(ctx);
  // Les ports d'abord : un démarrage refusé ne doit pas réécrire la configuration d'une stack qui tourne.
  await verifierPorts(ctx, infraSeule ? SERVICES_DOCKER : [...SERVICES_DOCKER, ...SERVICES_LOCAUX]);
  ecrireFichiers(ctx);

  lancer('docker', ['compose', 'up', '-d', '--build', '--wait'], ctx);
  creerBucket(ctx);
  if (!existsSync(path.join(ctx.racine, 'node_modules'))) {
    lancer('pnpm', ['install', '--frozen-lockfile'], ctx);
  }
  // Le back compilé : la CLI (migrations, seed), l'API et le worker tournent sur `dist/`.
  lancer('pnpm', ['run', 'build:back'], ctx);
  lancer('pnpm', ['run', 'migrate'], ctx);
  lancer('pnpm', ['run', 'seed'], ctx);

  if (infraSeule) {
    console.log('\nDépendances prêtes, base migrée et semée.');
    return;
  }
  console.log('\nStack prête (Ctrl-C arrête l’API, le worker et le front) :');
  await afficherAdresses(ctx, false);
  await auPremierPlan(ctx, {
    swc: ['run', 'dev:compiler'],
    api: ['run', 'dev:api'],
    worker: ['run', 'dev:worker'],
    front: ['--filter', './frontend', 'run', 'dev'],
  });
}

/** Lance les processus de dev, préfixe leurs sorties, et les arrête tous dès que l'un s'arrête. */
function auPremierPlan(ctx: Contexte, processus: Record<string, string[]>): Promise<void> {
  return new Promise((resolve) => {
    const enfants: ChildProcess[] = [];
    let arret = false;
    const toutArreter = () => {
      if (arret) return;
      arret = true;
      for (const e of enfants) e.kill('SIGTERM');
    };
    let restants = Object.keys(processus).length;
    for (const [nom, args] of Object.entries(processus)) {
      const enfant = spawn('pnpm', args, { cwd: ctx.racine, stdio: ['ignore', 'pipe', 'pipe'] });
      enfants.push(enfant);
      const prefixe = `[${nom}]`.padEnd(9);
      const relayer = (flux: NodeJS.WritableStream) => (morceau: Buffer) => {
        for (const ligne of morceau.toString().split('\n')) if (ligne) flux.write(`${prefixe}${ligne}\n`);
      };
      enfant.stdout?.on('data', relayer(process.stdout));
      enfant.stderr?.on('data', relayer(process.stderr));
      enfant.on('exit', (code) => {
        if (!arret) console.error(`${prefixe}arrêté (code ${code}) : arrêt des autres processus.`);
        toutArreter();
        if (--restants === 0) resolve();
      });
    }
    process.on('SIGINT', toutArreter);
    process.on('SIGTERM', toutArreter);
  });
}

function arreter(ctx: Contexte): void {
  lancer('docker', ['compose', 'down', '--remove-orphans'], ctx);
}

function detruire(ctx: Contexte, confirme: boolean): void {
  if (!ctx.estWorktree && !confirme) {
    throw new Error('Clone principal : la destruction efface la base locale. Relancer avec `pnpm destroy --yes`.');
  }
  lancer('docker', ['compose', 'down', '-v', '--remove-orphans'], ctx);
  console.log(`Stack et volumes de « ${ctx.projet} » supprimés.`);
}

async function etat(ctx: Contexte): Promise<void> {
  afficherContexte(ctx);
  if (!existsSync(path.join(ctx.racine, 'docker-compose.override.yaml'))) {
    console.log('Stack jamais démarrée ici (`pnpm start`).');
    return;
  }
  await afficherAdresses(ctx, true);
  lancer('docker', ['compose', 'ps', '--format', 'table {{.Service}}\t{{.Status}}'], ctx);
}

async function principal(): Promise<void> {
  const [commande, ...options] = process.argv.slice(2);
  const ctx = contexteCourant();
  switch (commande) {
    case 'start':
      return demarrer(ctx, options.includes('--infra'));
    case 'stop':
      return arreter(ctx);
    case 'destroy':
      return detruire(ctx, options.includes('--yes'));
    case 'status':
      return etat(ctx);
    default:
      throw new Error('Usage : node tools/stack/cli.ts start [--infra] | stop | destroy [--yes] | status');
  }
}

principal().catch((erreur: unknown) => {
  console.error(`\n${erreur instanceof Error ? erreur.message : String(erreur)}`);
  process.exit(1);
});
