// Magasin de fichiers (F-02, Q11) : sur disque en production (`/storage`, le volume de once,
// sauvegardé avec lui), dans S3 en local et en test (MinIO), pour que les deux implémentations
// servent. Passer la production à S3 ne demande qu'une configuration (`FILES_DRIVER=s3`).
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';

import { CONFIG, type Config } from '../config/config.ts';

export interface StoredFile {
  body: Buffer;
  contentType: string;
}

/** Clé d'un fichier : `studies/<id>/thumbnail.png` ; ni `..`, ni chemin absolu. */
const KEY = /^[a-z0-9][a-z0-9_.-]*(?:\/[a-z0-9][a-z0-9_.-]*)*$/;

export function checkKey(key: string): string {
  if (!KEY.test(key) || key.split('/').includes('..')) throw new Error(`Clé de fichier invalide : ${key}`);
  return key;
}

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.json': 'application/json' };

export abstract class FileStore {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** `null` si le fichier n'existe pas. */
  abstract get(key: string): Promise<StoredFile | null>;
  /** Sans effet si le fichier n'existe pas. */
  abstract delete(key: string): Promise<void>;
  close(): void {}
}

export class DiskFileStore extends FileStore {
  constructor(readonly dir: string) {
    super();
  }

  private file(key: string): string {
    return path.join(this.dir, checkKey(key));
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Écriture puis renommage : un lecteur ne voit jamais un fichier à moitié écrit.
    await writeFile(`${file}.tmp`, body);
    await rename(`${file}.tmp`, file);
  }

  async get(key: string): Promise<StoredFile | null> {
    try {
      return { body: await readFile(this.file(key)), contentType: TYPES[path.extname(key)] ?? 'application/octet-stream' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }
}

export class S3FileStore extends FileStore {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly prefix: string,
    options: { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string },
  ) {
    super();
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      forcePathStyle: true,
    });
  }

  private key(key: string): string {
    return `${this.prefix}${checkKey(key)}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.key(key), Body: body, ContentType: contentType }));
  }

  async get(key: string): Promise<StoredFile | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
      return { body: Buffer.from(await r.Body!.transformToByteArray()), contentType: r.ContentType ?? 'application/octet-stream' };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
  }

  override close(): void {
    this.client.destroy();
  }
}

export function createFileStore(config: Config): FileStore {
  if (config.FILES_DRIVER === 'disk') return new DiskFileStore(config.FILES_DIR);
  return new S3FileStore(config.S3_BUCKET!, config.FILES_PREFIX, {
    endpoint: config.S3_ENDPOINT!,
    region: config.S3_REGION,
    accessKeyId: config.S3_ACCESS_KEY_ID!,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
  });
}

@Injectable()
class FileStoreCloser implements OnModuleDestroy {
  constructor(@Inject(FileStore) private readonly files: FileStore) {}

  onModuleDestroy(): void {
    this.files.close();
  }
}

@Global()
@Module({
  providers: [{ provide: FileStore, inject: [CONFIG], useFactory: createFileStore }, FileStoreCloser],
  exports: [FileStore],
})
export class FilesModule {}
