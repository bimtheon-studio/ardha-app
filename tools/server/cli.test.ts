// `pnpm server` de bout en bout, sans serveur : un faux ssh exécute la commande distante dans un
// HOME temporaire (ce que ferait le shell de `ubuntu`), et ardha-env y parle au faux once.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');
let home: string;
let env: NodeJS.ProcessEnv;

beforeAll(() => {
  home = mkdtempSync(path.join(tmpdir(), 'ardha-server-'));
  const ssh = path.join(home, 'fake-ssh');
  // Ignore les options et l'hôte, puis confie la commande au shell, comme sshd.
  writeFileSync(
    ssh,
    `#!/usr/bin/env bash
while [[ $1 == -* ]]; do shift; done
echo "$1" > "${home}/host"
shift
cd "${home}" && HOME="${home}" exec bash -c "$*"
`,
    { mode: 0o755 },
  );
  env = {
    ...process.env,
    ARDHA_SERVER: 'ubuntu@serveur-de-test',
    ARDHA_SSH: ssh,
    ONCE: path.join(ROOT, 'test/deploy/fake-once'),
    FAKE_ONCE_STATE: path.join(home, '.fake-once'),
    FAKE_ONCE_NETWORK: 'inutile',
  };
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

function server(...args: string[]) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/server/cli.ts'), ...args], { cwd: ROOT, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('pnpm server', () => {
  it('sync copie compose.yaml, ardha-env (exécutable) et postgres/ dans ~/ardha (700)', () => {
    const r = server('sync');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Copie des fichiers du serveur vers ubuntu@serveur-de-test:~\/ardha/);
    expect(statSync(path.join(home, 'ardha')).mode & 0o777).toBe(0o700);
    expect(statSync(path.join(home, 'ardha/ardha-env')).mode & 0o111).not.toBe(0);
    expect(statSync(path.join(home, 'ardha/compose.yaml')).isFile()).toBe(true);
    expect(statSync(path.join(home, 'ardha/postgres/Dockerfile')).isFile()).toBe(true);
  });

  it('list appelle ardha-env sur le serveur', () => {
    const r = server('list');
    expect(r.code).toBe(0);
    expect(r.out).toBe('NOM\tHÔTE\tÉTAT\tIMAGE\n');
  });

  it('le code de sortie d’ardha-env remonte, avec son message', () => {
    const r = server('remove', 'production');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/supprimer la production demande « --confirm production »/);
  });

  it('registry : le jeton lu sur l’entrée standard arrive dans ~/ardha/secrets.env, pas dans les arguments', () => {
    writeFileSync(path.join(home, 'ardha/secrets.env'), 'POSTGRES_PASSWORD=x\n', { mode: 0o600 });
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/server/cli.ts'), 'registry', '--username', 'ci-bot'], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      input: 'ghp_jeton123\n',
    });
    expect(r.status).toBe(0);
    expect(readFileSync(path.join(home, 'ardha/secrets.env'), 'utf8')).toBe('POSTGRES_PASSWORD=x\nREGISTRY_USERNAME=ci-bot\nREGISTRY_PASSWORD=ghp_jeton123\n');
  });

  it('une commande inconnue affiche l’aide', () => {
    const r = server('deploy');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/Usage : pnpm server/);
  });
});
