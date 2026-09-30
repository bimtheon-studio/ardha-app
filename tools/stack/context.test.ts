import { describe, expect, it } from 'vitest';

import { contextFrom, readForcedOffset, projectName } from './context.ts';
import { branchOffset, BASE_PORTS } from './ports.ts';

describe('contexteDepuis', () => {
  it('clone principal : dossier commun relatif (.git), ports de base', () => {
    const ctx = contextFrom({ root: '/dev/ardha-app', commonDir: '.git', branch: 'master' });
    expect(ctx.isWorktree).toBe(false);
    expect(ctx.offset).toBe(0);
    expect(ctx.ports).toEqual(BASE_PORTS);
    expect(ctx.project).toBe('ardha-app');
    expect(ctx.cookieSession).toBe('ardha_session');
  });

  it('worktree : dossier commun absolu ailleurs, ports décalés, cookie suffixé', () => {
    const ctx = contextFrom({
      root: '/dev/ardha-l1',
      commonDir: '/dev/ardha-app/.git',
      branch: 'l1-carte',
    });
    expect(ctx.isWorktree).toBe(true);
    expect(ctx.offset).toBe(branchOffset('l1-carte'));
    expect(ctx.ports.postgres).toBe(BASE_PORTS.postgres + ctx.offset);
    expect(ctx.project).toBe('ardha-l1');
    expect(ctx.cookieSession).toBe('ardha_session_ardha_l1');
  });

  it('un décalage forcé l’emporte', () => {
    const ctx = contextFrom({ root: '/a', commonDir: '.git', branch: 'master' }, 42);
    expect(ctx.offset).toBe(42);
    expect(ctx.ports.api).toBe(BASE_PORTS.api + 42);
  });
});

describe('nomDeProjet', () => {
  it('rend un nom de projet Compose valide', () => {
    expect(projectName('Ardha App.v2')).toBe('ardha-app-v2');
    expect(projectName('__x')).toBe('x');
    expect(projectName('***')).toBe('ardha');
  });
});

describe('lireDecalageForce', () => {
  it('accepte un entier de 0 à 404, ignore une valeur vide', () => {
    expect(readForcedOffset(undefined)).toBeUndefined();
    expect(readForcedOffset('')).toBeUndefined();
    expect(readForcedOffset('17')).toBe(17);
  });

  it('refuse le reste, clairement', () => {
    expect(() => readForcedOffset('500')).toThrow(/ARDHA_PORT_OFFSET/);
    expect(() => readForcedOffset('abc')).toThrow(/ARDHA_PORT_OFFSET/);
  });
});
