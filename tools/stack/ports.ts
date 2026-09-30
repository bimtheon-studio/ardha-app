// Ports de la stack locale, décalés de façon déterministe par branche (D-09).
import { crc32 } from 'node:zlib';

/**
 * Ports de base, publiés par le clone principal. Volontairement hors des plages usuelles (5432,
 * 6379, 3000…) : d'autres projets de la machine les occupent, avec le même mécanisme de décalage.
 * Chaque base est espacée de plus de 404 (l'amplitude du décalage) de la suivante, pour que les
 * plages de deux services ne se recouvrent jamais.
 */
export const PORTS_DE_BASE = {
  api: 13000,
  web: 14000,
  postgres: 15432,
  redis: 16379,
  minio: 19000,
  minioConsole: 19500,
} as const;

export type Service = keyof typeof PORTS_DE_BASE;
export type Ports = Record<Service, number>;

export const LIBELLES: Record<Service, string> = {
  api: 'API',
  web: 'Front (Vite)',
  postgres: 'PostgreSQL',
  redis: 'Redis',
  minio: 'MinIO (S3)',
  minioConsole: 'MinIO (console)',
};

/** Décalage d'un worktree : `crc32(branche) % 400 + 5`, soit 5 à 404. */
export function decalageDeBranche(branche: string): number {
  return (crc32(branche) % 400) + 5;
}

export function portsDecales(decalage: number): Ports {
  const ports = {} as Ports;
  for (const [service, base] of Object.entries(PORTS_DE_BASE) as [Service, number][]) {
    ports[service] = base + decalage;
  }
  return ports;
}
