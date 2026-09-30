// Journal d'audit : qui a fait quoi, quand. Les secrets n'y entrent jamais, même par mégarde.
import { Inject, Injectable } from '@nestjs/common';

import { DB, type Db } from '../db/db.ts';
import { auditLog } from '../db/schema.ts';

export type AuditOrigin = 'api' | 'cli' | 'worker';

export interface AuditEvent {
  origin: AuditOrigin;
  action: string;
  actorId?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export const MASK = '[masqué]';
const SECRET_KEYS = /mot.?de.?passe|password|jeton|token|secret|cookie|hash/i;

/** Remplace, à toute profondeur, la valeur des clés qui ressemblent à un secret. */
export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, SECRET_KEYS.test(key) ? MASK : maskSecrets(v)]),
    );
  }
  return value;
}

@Injectable()
export class AuditLog {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(e: AuditEvent): Promise<void> {
    await this.db.insert(auditLog).values({
      origin: e.origin,
      action: e.action,
      actorId: e.actorId ?? null,
      targetId: e.targetId ?? null,
      details: maskSecrets(e.details ?? {}) as Record<string, unknown>,
      ip: e.ip ?? null,
    });
  }
}
