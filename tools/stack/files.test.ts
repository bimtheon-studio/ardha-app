import { describe, expect, it } from 'vitest';

import { contexteDepuis } from './context.ts';
import {
  DEBUT_BLOC,
  FIN_BLOC,
  lireEnv,
  nouveauxSecrets,
  override,
  secretsExistants,
  upsertBloc,
  variables,
} from './files.ts';

const ctx = contexteDepuis({ racine: '/dev/ardha-l1', dossierCommun: '/dev/ardha-app/.git', branche: 'l1' }, 7);
const secrets = { postgres: 'pg-secret', minio: 'minio-secret' };

describe('override', () => {
  it('nomme le projet, publie les ports décalés sur 127.0.0.1 et porte les mots de passe', () => {
    const yaml = override(ctx, secrets);
    expect(yaml).toContain('name: ardha-l1');
    expect(yaml).toContain('- 127.0.0.1:15439:5432');
    expect(yaml).toContain('- 127.0.0.1:16386:6379');
    expect(yaml).toContain('- 127.0.0.1:19007:9000');
    expect(yaml).toContain('- 127.0.0.1:19507:9001');
    expect(yaml).toContain('POSTGRES_PASSWORD: pg-secret');
    expect(yaml).toContain('MINIO_ROOT_PASSWORD: minio-secret');
    expect(yaml.match(/ports: !override/g)).toHaveLength(3);
  });
});

describe('variables', () => {
  it('aligne les URL sur les ports du worktree', () => {
    const v = variables(ctx, secrets);
    expect(v.DATABASE_URL).toBe('postgres://ardha:pg-secret@127.0.0.1:15439/ardha');
    expect(v.DATABASE_URL_TEST).toBe('postgres://ardha:pg-secret@127.0.0.1:15439/ardha_test');
    expect(v.REDIS_URL).toBe('redis://127.0.0.1:16386');
    expect(v.API_PORT).toBe('13007');
    expect(v.WEB_PORT).toBe('14007');
    expect(v.SESSION_COOKIE_NAME).toBe('ardha_session_ardha_l1');
  });
});

describe('upsertBloc', () => {
  it('ajoute le bloc à la fin d’un fichier, sans toucher au reste', () => {
    const sortie = upsertBloc('MA_VAR=1\n', { A: '1' });
    expect(sortie).toBe(`MA_VAR=1\n\n${DEBUT_BLOC}\nA=1\n${FIN_BLOC}\n`);
  });

  it('remplace un bloc existant en place', () => {
    const premier = upsertBloc('AVANT=1\n', { A: '1' }) + 'APRES=2\n';
    const second = upsertBloc(premier, { A: '2', B: '3' });
    expect(second).toContain('AVANT=1');
    expect(second).toContain('APRES=2');
    expect(second).toContain('A=2\nB=3');
    expect(second).not.toContain('A=1');
    expect(second.split(DEBUT_BLOC)).toHaveLength(2);
  });

  it('crée le fichier quand il est vide', () => {
    expect(upsertBloc('', { A: '1' })).toBe(`${DEBUT_BLOC}\nA=1\n${FIN_BLOC}\n`);
  });
});

describe('secrets', () => {
  it('relit les secrets d’un .env.local, pour ne pas changer le mot de passe d’un volume existant', () => {
    const env = upsertBloc('', variables(ctx, secrets));
    expect(secretsExistants(env)).toEqual(secrets);
    expect(secretsExistants('AUTRE=1')).toBeNull();
  });

  it('tire des secrets différents à chaque fois, utilisables tels quels dans une URL', () => {
    const a = nouveauxSecrets();
    const b = nouveauxSecrets();
    expect(a.postgres).not.toBe(b.postgres);
    expect(a.postgres).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('lireEnv ignore commentaires et lignes vides', () => {
    expect([...lireEnv('# c\n\nA=1\nB = 2\n')]).toEqual([['A', '1'], ['B', '2']]);
  });
});
