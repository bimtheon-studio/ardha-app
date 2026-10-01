import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { imageFor, plan, shellQuote } from './plan.ts';

const ctx = { repository: 'ghcr.io/bimtheon-studio/ardha', sha: '0123456789abcdef0123456789abcdef01234567', dirty: false, tty: false };

describe('shellQuote', () => {
  it('rend chaque argument intact après le shell distant', () => {
    const args = ['user:create-admin', '-n', 'Jean Dupont', "l'été", '$HOME', '`id`', 'a;b', ''];
    const r = spawnSync('bash', ['-c', `printf '%s\\n' ${args.map(shellQuote).join(' ')}`], { encoding: 'utf8' });
    expect(r.stdout.split('\n').slice(0, -1)).toEqual(args);
  });

  it('laisse tels quels les mots sans caractère spécial', () => {
    expect(shellQuote('pr-12')).toBe('pr-12');
    expect(shellQuote('ghcr.io/bimtheon-studio/ardha:sha-0123456')).toBe('ghcr.io/bimtheon-studio/ardha:sha-0123456');
  });
});

describe('imageFor', () => {
  it('étiquette immuable sha-<7>, comme la CI', () => {
    expect(imageFor(ctx)).toBe('ghcr.io/bimtheon-studio/ardha:sha-0123456');
  });
});

describe('plan', () => {
  it('create : copie les fichiers du serveur, puis ardha-env avec l’image du commit courant', () => {
    expect(plan(['create', 'pr-12'], ctx)).toEqual([
      { kind: 'sync' },
      { kind: 'remote', args: ['create', 'pr-12', '--image', 'ghcr.io/bimtheon-studio/ardha:sha-0123456'], tty: false },
    ]);
  });

  it('update : image explicite et --reset-db transmis', () => {
    expect(plan(['update', 'pr-12', '--image', 'ghcr.io/x/ardha:pr-12', '--reset-db'], ctx)).toEqual([
      { kind: 'sync' },
      { kind: 'remote', args: ['update', 'pr-12', '--image', 'ghcr.io/x/ardha:pr-12', '--reset-db'], tty: false },
    ]);
  });

  it('refuse l’image du commit courant si l’arbre de travail n’est pas propre', () => {
    expect(() => plan(['create', 'pr-12'], { ...ctx, dirty: true })).toThrow(/modifications non commitées/);
  });

  it('setup : copie, puis ardha-env setup', () => {
    expect(plan(['setup'], ctx)).toEqual([{ kind: 'sync' }, { kind: 'remote', args: ['setup'], tty: false }]);
  });

  it('image : construit l’image du commit ; --push la publie', () => {
    const image = 'ghcr.io/bimtheon-studio/ardha:sha-0123456';
    expect(plan(['image'], ctx)).toEqual([{ kind: 'build', image }]);
    expect(plan(['image', '--push'], ctx)).toEqual([{ kind: 'build', image }, { kind: 'push', image }]);
    expect(() => plan(['image'], { ...ctx, dirty: true })).toThrow(/modifications non commitées/);
  });

  it('remove, list, logs, exec, psql : transmis à ardha-env, avec un terminal quand il le faut', () => {
    expect(plan(['remove', 'production', '--confirm', 'production'], ctx)).toEqual([
      { kind: 'remote', args: ['remove', 'production', '--confirm', 'production'], tty: false },
    ]);
    expect(plan(['list'], ctx)).toEqual([{ kind: 'remote', args: ['list'], tty: false }]);
    expect(plan(['logs', 'pr-3', '--follow'], { ...ctx, tty: true })).toEqual([
      { kind: 'remote', args: ['logs', 'pr-3', '--follow'], tty: true },
    ]);
    expect(plan(['exec', 'pr-3', 'ardha', 'user:list'], { ...ctx, tty: true })).toEqual([
      { kind: 'remote', args: ['exec', 'pr-3', 'ardha', 'user:list'], tty: true },
    ]);
    expect(plan(['psql', 'production'], { ...ctx, tty: true })).toEqual([
      { kind: 'remote', args: ['psql', 'production'], tty: true },
    ]);
    expect(plan(['psql', 'production'], ctx)).toEqual([{ kind: 'remote', args: ['psql', 'production'], tty: false }]);
  });

  it('sync seul', () => {
    expect(plan(['sync'], ctx)).toEqual([{ kind: 'sync' }]);
  });

  it('aide sur une commande inconnue ou absente', () => {
    expect(() => plan([], ctx)).toThrow(/Usage : pnpm server/);
    expect(() => plan(['deploy'], ctx)).toThrow(/Usage : pnpm server/);
    expect(() => plan(['create'], ctx)).toThrow(/nom d’environnement manquant/);
  });
});
