import { describe, expect, it } from 'vitest';

import { contextFrom } from './context.ts';
import {
  BLOCK_START,
  BLOCK_END,
  parseEnv,
  newSecrets,
  override,
  existingSecrets,
  upsertBlock,
  variables,
} from './files.ts';

const ctx = contextFrom({ root: '/dev/ardha-l1', commonDir: '/dev/ardha-app/.git', branch: 'l1' }, 7);
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
    const output = upsertBlock('MA_VAR=1\n', { A: '1' });
    expect(output).toBe(`MA_VAR=1\n\n${BLOCK_START}\nA=1\n${BLOCK_END}\n`);
  });

  it('remplace un bloc existant en place', () => {
    const first = upsertBlock('AVANT=1\n', { A: '1' }) + 'APRES=2\n';
    const second = upsertBlock(first, { A: '2', B: '3' });
    expect(second).toContain('AVANT=1');
    expect(second).toContain('APRES=2');
    expect(second).toContain('A=2\nB=3');
    expect(second).not.toContain('A=1');
    expect(second.split(BLOCK_START)).toHaveLength(2);
  });

  it('ne garde qu’un bloc quand le fichier en contient plusieurs, même sous un ancien en-tête', () => {
    const old = '# >>> ardha stack (généré par `pnpm demarrer`, ne pas committer) >>>\nA=0\n' + BLOCK_END + '\n';
    const doubled = `AVANT=1\n\n${old}\n${upsertBlock('', { A: '1' })}\n${upsertBlock('', { A: '1' })}APRES=2\n`;
    const output = upsertBlock(doubled, { A: '2' });
    expect(output.split('# >>> ardha stack')).toHaveLength(2);
    expect(output).toBe(`AVANT=1\n\n${BLOCK_START}\nA=2\n${BLOCK_END}\n\nAPRES=2\n`);
    expect(upsertBlock(output, { A: '2' })).toBe(output);
  });

  it('crée le fichier quand il est vide', () => {
    expect(upsertBlock('', { A: '1' })).toBe(`${BLOCK_START}\nA=1\n${BLOCK_END}\n`);
  });
});

describe('secrets', () => {
  it('relit les secrets d’un .env.local, pour ne pas changer le mot de passe d’un volume existant', () => {
    const env = upsertBlock('', variables(ctx, secrets));
    expect(existingSecrets(env)).toEqual(secrets);
    expect(existingSecrets('AUTRE=1')).toBeNull();
    // Un .env.local écrit avant le passage des noms en anglais.
    expect(existingSecrets('ARDHA_POSTGRES_MOT_DE_PASSE=a\nARDHA_MINIO_MOT_DE_PASSE=b')).toEqual({ postgres: 'a', minio: 'b' });
  });

  it('tire des secrets différents à chaque fois, utilisables tels quels dans une URL', () => {
    const a = newSecrets();
    const b = newSecrets();
    expect(a.postgres).not.toBe(b.postgres);
    expect(a.postgres).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('lireEnv ignore commentaires et lignes vides', () => {
    expect([...parseEnv('# c\n\nA=1\nB = 2\n')]).toEqual([['A', '1'], ['B', '2']]);
  });
});
