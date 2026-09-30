import { describe, expect, it } from 'vitest';

import { contexteDepuis, lireDecalageForce, nomDeProjet } from './contexte.ts';
import { decalageDeBranche, PORTS_DE_BASE } from './ports.ts';

describe('contexteDepuis', () => {
  it('clone principal : dossier commun relatif (.git), ports de base', () => {
    const ctx = contexteDepuis({ racine: '/dev/ardha-app', dossierCommun: '.git', branche: 'master' });
    expect(ctx.estWorktree).toBe(false);
    expect(ctx.decalage).toBe(0);
    expect(ctx.ports).toEqual(PORTS_DE_BASE);
    expect(ctx.projet).toBe('ardha-app');
    expect(ctx.cookieSession).toBe('ardha_session');
  });

  it('worktree : dossier commun absolu ailleurs, ports décalés, cookie suffixé', () => {
    const ctx = contexteDepuis({
      racine: '/dev/ardha-l1',
      dossierCommun: '/dev/ardha-app/.git',
      branche: 'l1-carte',
    });
    expect(ctx.estWorktree).toBe(true);
    expect(ctx.decalage).toBe(decalageDeBranche('l1-carte'));
    expect(ctx.ports.postgres).toBe(PORTS_DE_BASE.postgres + ctx.decalage);
    expect(ctx.projet).toBe('ardha-l1');
    expect(ctx.cookieSession).toBe('ardha_session_ardha_l1');
  });

  it('un décalage forcé l’emporte', () => {
    const ctx = contexteDepuis({ racine: '/a', dossierCommun: '.git', branche: 'master' }, 42);
    expect(ctx.decalage).toBe(42);
    expect(ctx.ports.api).toBe(PORTS_DE_BASE.api + 42);
  });
});

describe('nomDeProjet', () => {
  it('rend un nom de projet Compose valide', () => {
    expect(nomDeProjet('Ardha App.v2')).toBe('ardha-app-v2');
    expect(nomDeProjet('__x')).toBe('x');
    expect(nomDeProjet('***')).toBe('ardha');
  });
});

describe('lireDecalageForce', () => {
  it('accepte un entier de 0 à 404, ignore une valeur vide', () => {
    expect(lireDecalageForce(undefined)).toBeUndefined();
    expect(lireDecalageForce('')).toBeUndefined();
    expect(lireDecalageForce('17')).toBe(17);
  });

  it('refuse le reste, clairement', () => {
    expect(() => lireDecalageForce('500')).toThrow(/ARDHA_PORT_OFFSET/);
    expect(() => lireDecalageForce('abc')).toThrow(/ARDHA_PORT_OFFSET/);
  });
});
