// Script serveur `ardha-env` (lot LD, étape 3), de bout en bout : les services partagés de
// `deploy/server/compose.yaml` sous un nom de test, sur un réseau qui joue le rôle du réseau `once`,
// et un faux once (`fake-once`) qui démarre réellement l'image de production. Vérifie ce que le
// serveur partagé exige : chaque environnement a sa base, son rôle (non superutilisateur), son
// préfixe Redis, et `remove` ne laisse rien.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { IMAGE } from './build-image.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const ID = `ardha-envtest-${process.pid}`;
const DOMAIN = 'test.local';
const home = mkdtempSync(path.join(tmpdir(), 'ardha-env-'));
const state = path.join(home, '.fake-once');

const env: NodeJS.ProcessEnv = {
  ...process.env,
  ARDHA_HOME: home,
  ARDHA_DOMAIN: DOMAIN,
  ARDHA_SERVICES: ID,
  ARDHA_COMPOSE_PROJECT: ID,
  ARDHA_NETWORK: ID,
  ARDHA_MAX_PR: '1',
  ONCE: path.join(ROOT, 'test/deploy/fake-once'),
  FAKE_ONCE_STATE: state,
  FAKE_ONCE_NETWORK: ID,
};

interface Result {
  code: number;
  out: string;
  err: string;
}

function ardhaEnv(...args: string[]): Result {
  const r = spawnSync(path.join(ROOT, 'deploy/server/ardha-env'), args, { env, encoding: 'utf8', input: '' });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

/** Comme la CI : la commande forcée de sa clé SSH reçoit la commande demandée dans SSH_ORIGINAL_COMMAND. */
function ci(command: string): Result {
  const r = spawnSync(path.join(ROOT, 'deploy/server/ardha-env'), ['ci'], {
    env: { ...env, SSH_ORIGINAL_COMMAND: command },
    encoding: 'utf8',
    input: '',
  });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

function ok(...args: string[]): string {
  const r = ardhaEnv(...args);
  if (r.code !== 0) throw new Error(`ardha-env ${args.join(' ')} : code ${r.code}\n${r.out}\n${r.err}`);
  return r.out;
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Requête en superutilisateur sur le Postgres de test. */
function sql(database: string, query: string): string {
  return docker('exec', `${ID}-postgres`, 'psql', '-qAt', '-U', 'postgres', '-d', database, '-c', query);
}

const calls = () => readFileSync(path.join(state, 'calls'), 'utf8').trim().split('\n');

async function eventually(check: () => boolean, what: string, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) throw new Error(`${what} : délai dépassé`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

beforeAll(() => {
  // Ce que la commande de déploiement copie sur le serveur.
  cpSync(path.join(ROOT, 'deploy/server/compose.yaml'), path.join(home, 'compose.yaml'));
  cpSync(path.join(ROOT, 'docker/postgres'), path.join(home, 'postgres'), { recursive: true });
  docker('network', 'create', ID);
});

afterAll(() => {
  for (const name of docker('ps', '-aq', '--filter', `network=${ID}`).split('\n').filter(Boolean)) {
    spawnSync('docker', ['rm', '--force', '--volumes', name]);
  }
  spawnSync('docker', ['compose', '-p', ID, '-f', path.join(home, 'compose.yaml'), 'down', '--volumes'], {
    env: { ...env, POSTGRES_PASSWORD: 'x' },
  });
  for (const v of ['ardha-fake-storage', 'ardha-pr-1-fake-storage']) spawnSync('docker', ['volume', 'rm', v]);
  spawnSync('docker', ['network', 'rm', ID]);
  rmSync(home, { recursive: true, force: true });
});

describe('ardha-env', () => {
  it('refuse un nom qui n’est ni production ni pr-<numéro>', () => {
    const r = ardhaEnv('create', 'staging', '--image', IMAGE);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/nom invalide « staging »/);
  });

  it('sans services, refuse de créer et dit quoi faire', () => {
    const r = ardhaEnv('create', 'pr-1', '--image', IMAGE);
    expect(r.err).toMatch(/lancer « ardha-env setup »/);
  });

  it('setup : secrets lisibles par le seul propriétaire, Postgres et Redis sur le réseau once ; rejouable', () => {
    expect(ok('setup')).toMatch(/Secrets créés/);
    const secrets = path.join(home, 'secrets.env');
    expect(statSync(secrets).mode & 0o777).toBe(0o600);
    const password = readFileSync(secrets, 'utf8');
    expect(ok('setup')).not.toMatch(/Secrets créés/);
    expect(readFileSync(secrets, 'utf8')).toBe(password);
    expect(docker('inspect', '-f', '{{json .NetworkSettings.Networks}}', `${ID}-postgres`)).toContain(ID);
    expect(docker('inspect', '-f', '{{json .NetworkSettings.Ports}}', `${ID}-postgres`)).not.toMatch(/HostPort/);
  });

  it('create production : base et rôle à son nom, sans droits de superutilisateur ; migrée, pas semée', () => {
    expect(ok('create', 'production', '--image', IMAGE)).toMatch(/Environnement production prêt : https:\/\/ardha\.test\.local/);
    expect(sql('postgres', `SELECT rolsuper FROM pg_roles WHERE rolname = 'ardha_production'`)).toBe('f');
    expect(sql('ardha_production', 'SELECT count(*) FROM drizzle.__drizzle_migrations')).toBe('3');
    expect(sql('ardha_production', 'SELECT count(*) FROM communes')).toBe('0');
    expect(statSync(path.join(home, 'envs/production.env')).mode & 0o777).toBe(0o600);
    expect(calls().at(-1)).toBe(
      `deploy ${IMAGE} --host ardha.test.local --memory 1024 --auto-update=false --backup-path ${home}/backups/production --auto-backup ` +
        '--env DATABASE_URL=… --env REDIS_URL=… --env REDIS_PREFIX=… --env LOG_LEVEL=…',
    );
  });

  it('create pr-1 : semée au démarrage, clés Redis sous son préfixe, 512 Mo', async () => {
    ok('create', 'pr-1', '--image', IMAGE);
    expect(calls().at(-1)).toMatch(/^deploy \S+ --host ardha-pr-1\.test\.local --memory 512 --auto-update=false --env/);
    // Le bilan du seed s'imprime une fois toutes les communes chargées.
    await eventually(() => /Seed : Beaumont-Village \(37023\) chargée/.test(ok('logs', 'pr-1')), 'seed de pr-1');
    expect(sql('ardha_pr_1', 'SELECT count(*) FROM communes')).toBe('4');
    expect(docker('exec', `${ID}-redis`, 'redis-cli', '--scan', '--pattern', 'ardha-pr-1:*')).toMatch(/^ardha-pr-1:bull:/m);
  });

  it('refuse un environnement en double, et au-delà du nombre de PR permis', () => {
    expect(ardhaEnv('create', 'pr-1', '--image', IMAGE).err).toMatch(/pr-1 existe déjà/);
    expect(ardhaEnv('create', 'pr-2', '--image', IMAGE).err).toMatch(/déjà 1 environnements de PR \(au plus 1\)/);
  });

  it('list : chaque environnement, son hôte, son état et son image', () => {
    const lines = ok('list').trim().split('\n');
    expect(lines).toEqual([
      'NOM\tHÔTE\tÉTAT\tIMAGE',
      `pr-1\thttps://ardha-pr-1.test.local\trunning\t${IMAGE}`,
      `production\thttps://ardha.test.local\trunning\t${IMAGE}`,
    ]);
  });

  it('exec, logs et psql pour déboguer un environnement', () => {
    expect(ok('exec', 'pr-1', 'ardha', 'user:list')).toBe('Aucun compte.\n');
    expect(ok('logs', 'pr-1', '--tail', '500')).toMatch(/"name":"launcher"|Migrations à jour/);
    expect(ok('psql', 'pr-1', '-qAt', '-c', 'SELECT count(*) FROM communes')).toBe('4\n');
  });

  it('mode ci (clé SSH de la CI) : refuse tout ce qui sort des PR, de la mise à jour de la production et de la lecture', () => {
    const sha = 'ghcr.io/bimtheon-studio/ardha:sha-0123abc';
    for (const command of [
      '',
      'setup',
      'psql pr-1',
      'exec pr-1 ardha user:list',
      'remove production --confirm production',
      `create production --image ${sha}`,
      `update production --image ${sha} --reset-db`,
      'create pr-2 --image ardha:test',
      'create pr-2 --image ghcr.io/bimtheon-studio/ardha:pr-2',
      'create pr-2 --image ghcr.io/autre/ardha:sha-0123abc',
      `create pr-2 --image ${sha} --memory 4096`,
      'list; rm -rf ~',
      'logs pr-1 --follow',
      'sweep pr-1',
    ]) {
      const r = ci(command);
      expect(r.code, command).toBe(1);
      expect(r.err, command).toMatch(/commande refusée à la CI/);
    }
  });

  it('admin-link : crée l’admin de recette, puis renouvelle son lien ; PR seulement, permis à la CI', () => {
    const first = ci('admin-link pr-1');
    expect(first.out).toMatch(/Administrateur créé : recette@ardha\.test/);
    expect(first.out).toMatch(/^http:\/\/ardha-pr-1\.test\.local\/reset-password#\S+$/m);
    const again = ok('admin-link', 'pr-1');
    expect(again).toMatch(/^http:\/\/ardha-pr-1\.test\.local\/reset-password#\S+$/m);
    expect(again).not.toMatch(/Administrateur créé/);
    expect(ardhaEnv('admin-link', 'production').err).toMatch(/environnements de PR seulement/);
    expect(ci('admin-link production').err).toMatch(/commande refusée à la CI/);
  });

  it('mode ci : liste, journaux et balayage permis ; « ardha/ardha-env » en tête (pnpm server) accepté', () => {
    expect(ci('ardha/ardha-env list').out).toMatch(/^pr-1\t/m);
    expect(ci('logs pr-1 --tail 5').code).toBe(0);
    expect(ci('sweep --keep pr-1,pr-12').out).toBe('Balayage : 0 environnement(s) supprimé(s).\n');
  });

  it('update --reset-db : nouvelle base, resemée ; l’environnement (mots de passe compris) est repris', async () => {
    const before = readFileSync(path.join(home, 'envs/pr-1.env'), 'utf8');
    sql('ardha_pr_1', `INSERT INTO users (email, name) VALUES ('x@exemple.fr', 'X')`);
    ok('update', 'pr-1', '--image', IMAGE, '--reset-db');
    expect(readFileSync(path.join(home, 'envs/pr-1.env'), 'utf8')).toBe(before);
    expect(sql('ardha_pr_1', 'SELECT count(*) FROM users')).toBe('0');
    await eventually(() => sql('ardha_pr_1', 'SELECT count(*) FROM communes') === '4', 'seed après reset');
    expect(calls().at(-1)).toMatch(/^update ardha-pr-1\.test\.local --image \S+ --env DATABASE_URL=…/);
  });

  it('refuse --reset-db sur la production, et sa suppression sans confirmation', () => {
    expect(ardhaEnv('update', 'production', '--image', IMAGE, '--reset-db').err).toMatch(/refusé sur la production/);
    expect(ardhaEnv('remove', 'production').err).toMatch(/--confirm production/);
  });

  it('sweep sans PR ouverte : pr-1 supprimée, sans application, base, rôle, clé Redis ni fichier', () => {
    expect(ci('sweep --keep').out).toMatch(/Environnement pr-1 supprimé\.\nBalayage : 1 environnement\(s\) supprimé\(s\)\./);
    expect(sql('postgres', `SELECT count(*) FROM pg_database WHERE datname = 'ardha_pr_1'`)).toBe('0');
    expect(sql('postgres', `SELECT count(*) FROM pg_roles WHERE rolname = 'ardha_pr_1'`)).toBe('0');
    expect(docker('exec', `${ID}-redis`, 'redis-cli', '--scan', '--pattern', 'ardha-pr-1:*')).toBe('');
    expect(docker('ps', '-aq', '--filter', 'name=^once-app-ardha-pr-1-')).toBe('');
    expect(existsSync(path.join(home, 'envs/pr-1.env'))).toBe(false);
    // La production n'a pas bougé.
    expect(ok('list')).toMatch(/^production\t.*\trunning\t/m);
  });

  it('registry : identifiants de ghcr.io (paquet privé) dans secrets.env, lus sur l’entrée standard ; pas pour la CI', () => {
    const set = (password: string) =>
      spawnSync(path.join(ROOT, 'deploy/server/ardha-env'), ['registry', '--username', 'ci-bot'], { env, encoding: 'utf8', input: password });
    expect(set('').stderr).toMatch(/jeton vide/);
    expect(set('ghp_premier\n').status).toBe(0);
    expect(set('ghp_second\n').stdout).toMatch(/Identifiants du registre enregistrés pour ci-bot/);
    const secrets = readFileSync(path.join(home, 'secrets.env'), 'utf8');
    expect(secrets).toMatch(/^POSTGRES_PASSWORD=\S+$/m);
    expect(secrets.match(/^REGISTRY_/gm)).toHaveLength(2);
    expect(secrets).toMatch(/^REGISTRY_USERNAME=ci-bot$/m);
    expect(secrets).toMatch(/^REGISTRY_PASSWORD=ghp_second$/m);
    expect(statSync(path.join(home, 'secrets.env')).mode & 0o777).toBe(0o600);
    expect(ci('registry --username x').err).toMatch(/commande refusée à la CI/);
  });

  it('un déploiement en échec ne laisse rien', () => {
    const r = ardhaEnv('create', 'pr-7', '--image', 'ardha:inexistante');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/échec du déploiement de pr-7 : rien n'a été gardé/);
    // once a reçu les identifiants du registre, le mot de passe par l'entrée standard.
    expect(calls().at(-1)).toMatch(/ --registry-username ci-bot --registry-password-stdin$/);
    expect(readFileSync(path.join(state, 'registry-password'), 'utf8')).toBe('ghp_second\n');
    expect(sql('postgres', `SELECT count(*) FROM pg_database WHERE datname = 'ardha_pr_7'`)).toBe('0');
    expect(existsSync(path.join(home, 'envs/pr-7.env'))).toBe(false);
  });

  it('remove production --confirm production', () => {
    ok('remove', 'production', '--confirm', 'production');
    expect(ok('list').trim()).toBe('NOM\tHÔTE\tÉTAT\tIMAGE');
  });
});
