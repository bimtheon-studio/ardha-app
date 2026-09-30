// `pnpm demarrer | arreter | detruire | etat` : la stack locale, isolée par worktree (D-09).
//
// `demarrer` reconnaît un worktree, décale les ports d'après la branche, génère
// `docker-compose.override.yaml` et `.env.local`, vérifie que les ports sont libres, lance les
// dépendances (Postgres, Redis, MinIO), joue les migrations et le seed, puis l'API, le worker et le
// front au premier plan (Ctrl-C les arrête ; les conteneurs restent). `--infra` s'arrête avant.
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { contexteCourant, type Contexte } from './contexte.ts';
import { nouveauxSecrets, override, secretsExistants, upsertBloc, variables } from './fichiers.ts';
import { portVraimentLibre } from './libre.ts';
import { LIBELLES, type Service } from './ports.ts';

const SERVICES_DOCKER: Service[] = ['postgres', 'redis', 'minio', 'minioConsole'];
const SERVICES_LOCAUX: Service[] = ['api', 'web'];

function afficherContexte(ctx: Contexte): void {
  const titre = ctx.estWorktree
    ? `Worktree isolé « ${ctx.projet} » (branche ${ctx.branche}, décalage +${ctx.decalage})`
    : `Clone principal « ${ctx.projet} » (branche ${ctx.branche}, décalage +${ctx.decalage})`;
  console.log(`\n${titre}`);
  for (const service of [...SERVICES_LOCAUX, ...SERVICES_DOCKER]) {
    console.log(`  ${LIBELLES[service].padEnd(16)} 127.0.0.1:${ctx.ports[service]}`);
  }
  console.log(`  ${'Cookie'.padEnd(16)} ${ctx.cookieSession}\n`);
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
        `  ARDHA_DECALAGE=${ctx.decalage >= 404 ? 5 : ctx.decalage + 1} pnpm demarrer`,
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
  ecrireFichiers(ctx);
  await verifierPorts(ctx, infraSeule ? SERVICES_DOCKER : [...SERVICES_DOCKER, ...SERVICES_LOCAUX]);

  lancer('docker', ['compose', 'up', '-d', '--build', '--wait'], ctx);
  creerBucket(ctx);
  if (!existsSync(path.join(ctx.racine, 'node_modules'))) {
    lancer('pnpm', ['install', '--frozen-lockfile'], ctx);
  }
  // Le back compilé : la CLI (migrations, seed), l'API et le worker tournent sur `dist/`.
  lancer('pnpm', ['run', 'build:back'], ctx);
  lancer('pnpm', ['run', 'migrer'], ctx);
  lancer('pnpm', ['run', 'semer'], ctx);

  if (infraSeule) {
    console.log('\nDépendances prêtes, base migrée et semée.');
    return;
  }
  console.log(`\nFront : http://127.0.0.1:${ctx.ports.web}  ·  API : http://127.0.0.1:${ctx.ports.api}  ·  Ctrl-C pour arrêter\n`);
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
    throw new Error('Clone principal : la destruction efface la base locale. Relancer avec `pnpm detruire --oui`.');
  }
  lancer('docker', ['compose', 'down', '-v', '--remove-orphans'], ctx);
  console.log(`Stack et volumes de « ${ctx.projet} » supprimés.`);
}

function etat(ctx: Contexte): void {
  afficherContexte(ctx);
  if (existsSync(path.join(ctx.racine, 'docker-compose.override.yaml'))) {
    lancer('docker', ['compose', 'ps'], ctx);
  } else {
    console.log('Stack jamais démarrée ici (`pnpm demarrer`).');
  }
}

async function principal(): Promise<void> {
  const [commande, ...options] = process.argv.slice(2);
  const ctx = contexteCourant();
  switch (commande) {
    case 'demarrer':
      return demarrer(ctx, options.includes('--infra'));
    case 'arreter':
      return arreter(ctx);
    case 'detruire':
      return detruire(ctx, options.includes('--oui'));
    case 'etat':
      return etat(ctx);
    default:
      throw new Error('Usage : node tools/stack/cli.ts demarrer [--infra] | arreter | detruire [--oui] | etat');
  }
}

principal().catch((erreur: unknown) => {
  console.error(`\n${erreur instanceof Error ? erreur.message : String(erreur)}`);
  process.exit(1);
});
