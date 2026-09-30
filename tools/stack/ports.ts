// Ports de la stack locale, décalés de façon déterministe par branche (D-09).
import { crc32 } from 'node:zlib';

/**
 * Ports de base, publiés par le clone principal. Volontairement hors des plages usuelles (5432,
 * 6379, 3000…) : d'autres projets de la machine les occupent, avec le même mécanisme de décalage.
 * Chaque base est espacée de plus de 404 (l'amplitude du décalage) de la suivante, pour que les
 * plages de deux services ne se recouvrent jamais.
 */
export const BASE_PORTS = {
  api: 13000,
  web: 14000,
  postgres: 15432,
  redis: 16379,
  minio: 19000,
  minioConsole: 19500,
  /** Stack jetable des tests e2e (`pnpm test:e2e`) : API et front, à côté de la stack de dev. */
  e2eApi: 17000,
  e2eWeb: 18000,
} as const;

export type Service = keyof typeof BASE_PORTS;
export type Ports = Record<Service, number>;

export const LABELS: Record<Service, string> = {
  api: 'API',
  web: 'Front (Vite)',
  postgres: 'PostgreSQL',
  redis: 'Redis',
  minio: 'MinIO (S3)',
  minioConsole: 'MinIO (console)',
  e2eApi: 'API (e2e)',
  e2eWeb: 'Front (e2e)',
};

/** Décalage d'un worktree : `crc32(branch) % 400 + 5`, soit 5 à 404. */
export function branchOffset(branch: string): number {
  return (crc32(branch) % 400) + 5;
}

export function offsetPorts(offset: number): Ports {
  const ports = {} as Ports;
  for (const [service, db] of Object.entries(BASE_PORTS) as [Service, number][]) {
    ports[service] = db + offset;
  }
  return ports;
}
