import { describe, expect, it } from 'vitest';

import { adresses, lien } from './adresses.ts';
import { contexteDepuis } from './contexte.ts';

describe('adresses', () => {
  it('donne des URL complètes aux ports du worktree, sans mot de passe', () => {
    const ctx = contexteDepuis({ racine: '/a', dossierCommun: '.git', branche: 'master' }, 7);
    const liste = adresses(ctx);
    expect(liste.map((a) => a.url)).toEqual([
      'http://127.0.0.1:14007/',
      'http://127.0.0.1:13007/api/health',
      'http://127.0.0.1:13007/api/openapi.json',
      'http://127.0.0.1:19507/',
      'http://127.0.0.1:19007',
      'postgres://ardha@127.0.0.1:15439/ardha',
      'redis://127.0.0.1:16386',
    ]);
  });
});

describe('lien', () => {
  it('encadre l’URL d’un hyperlien OSC 8 dans un terminal, la laisse brute sinon', () => {
    expect(lien('http://x/', false)).toBe('http://x/');
    expect(lien('http://x/', true)).toBe('\u001b]8;;http://x/\u001b\\http://x/\u001b]8;;\u001b\\');
  });
});
