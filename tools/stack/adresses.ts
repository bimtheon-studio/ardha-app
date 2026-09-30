// Adresses de la stack, à afficher : URL complètes, que les terminaux rendent cliquables.
import type { Contexte } from './contexte.ts';
import type { Service } from './ports.ts';

export interface Adresse {
  libelle: string;
  url: string;
  /** Service dont le port dit si l'adresse répond. */
  service: Service;
}

export function adresses(ctx: Contexte): Adresse[] {
  const h = (port: number) => `http://127.0.0.1:${port}`;
  const { ports } = ctx;
  return [
    { libelle: 'Front', url: `${h(ports.web)}/`, service: 'web' },
    { libelle: 'API (santé)', url: `${h(ports.api)}/api/health`, service: 'api' },
    { libelle: 'API (OpenAPI)', url: `${h(ports.api)}/api/openapi.json`, service: 'api' },
    { libelle: 'MinIO (console)', url: `${h(ports.minioConsole)}/`, service: 'minioConsole' },
    { libelle: 'MinIO (S3)', url: h(ports.minio), service: 'minio' },
    { libelle: 'PostgreSQL', url: `postgres://ardha@127.0.0.1:${ports.postgres}/ardha`, service: 'postgres' },
    { libelle: 'Redis', url: `redis://127.0.0.1:${ports.redis}`, service: 'redis' },
  ];
}

/** Hyperlien OSC 8 (cliquable même hors détection d'URL) ; texte brut hors terminal. */
export function lien(url: string, terminal: boolean): string {
  return terminal ? `\u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\` : url;
}
