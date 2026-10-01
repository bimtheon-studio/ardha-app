// Adresses de la stack, à afficher : URL complètes, que les terminaux rendent cliquables.
import type { Context } from './context.ts';
import type { Service } from './ports.ts';

export interface Address {
  label: string;
  url: string;
  /** Service dont le port dit si l'adresse répond. */
  service: Service;
}

export function addresses(ctx: Context): Address[] {
  const h = (port: number) => `http://127.0.0.1:${port}`;
  const { ports } = ctx;
  return [
    { label: 'Front', url: `${h(ports.web)}/`, service: 'web' },
    { label: 'API (santé)', url: `${h(ports.api)}/up`, service: 'api' },
    { label: 'API (OpenAPI)', url: `${h(ports.api)}/api/openapi.json`, service: 'api' },
    { label: 'MinIO (console)', url: `${h(ports.minioConsole)}/`, service: 'minioConsole' },
    { label: 'MinIO (S3)', url: h(ports.minio), service: 'minio' },
    { label: 'PostgreSQL', url: `postgres://ardha@127.0.0.1:${ports.postgres}/ardha`, service: 'postgres' },
    { label: 'Redis', url: `redis://127.0.0.1:${ports.redis}`, service: 'redis' },
  ];
}

/** Hyperlien OSC 8 (cliquable même hors détection d'URL) ; texte brut hors terminal. */
export function link(url: string, terminal: boolean): string {
  return terminal ? `\u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\` : url;
}
