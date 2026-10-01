// Magasin de fichiers (F-02, Q11) : le disque (production) et S3 (MinIO du worktree, comme en local).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { checkKey, createFileStore, DiskFileStore, type FileStore } from '../src/shared/files.ts';
import { testConfig } from './env.ts';

const dir = await mkdtemp(path.join(tmpdir(), 'ardha-files-'));
const config = testConfig();
const stores: [string, FileStore][] = [
  ['disque', new DiskFileStore(dir)],
  ['configuré', createFileStore(config)],
];

afterAll(async () => {
  for (const [, s] of stores) s.close();
  await rm(dir, { recursive: true, force: true });
});

it('les tests du worktree passent par S3 (MinIO), comme le développement', () => {
  expect(config.FILES_DRIVER).toBe('s3');
});

describe.each(stores)('magasin %s', (_, files) => {
  it('écrit, relit, remplace et supprime', async () => {
    const key = 'studies/0193/thumbnail.png';
    expect(await files.get(key)).toBeNull();
    await files.put(key, Buffer.from('un'), 'image/png');
    expect(await files.get(key)).toEqual({ body: Buffer.from('un'), contentType: 'image/png' });
    await files.put(key, Buffer.from('deux'), 'image/png');
    expect((await files.get(key))?.body.toString()).toBe('deux');
    await files.delete(key);
    await files.delete(key);
    expect(await files.get(key)).toBeNull();
  });
});

it('refuse les clés qui sortent du magasin', () => {
  for (const key of ['../x', '/etc/passwd', 'a/../../b', 'A/b', 'a//b', '']) expect(() => checkKey(key)).toThrow('Clé de fichier invalide');
  expect(checkKey('studies/0193-ab/thumbnail.png')).toBe('studies/0193-ab/thumbnail.png');
});

it('le disque relaie les erreurs autres que « absent » ; S3 aussi (bucket inexistant)', async () => {
  const disk = createFileStore({ ...config, FILES_DRIVER: 'disk', FILES_DIR: dir });
  expect(disk).toBeInstanceOf(DiskFileStore);
  await disk.put('dossier/fichier.png', Buffer.from('x'), 'image/png');
  await expect(disk.get('dossier')).rejects.toThrow(/EISDIR/);
  const s3 = createFileStore({ ...config, S3_BUCKET: 'bucket-absent' });
  await expect(s3.get('x.png')).rejects.toThrow(/bucket/i);
  s3.close();
});
