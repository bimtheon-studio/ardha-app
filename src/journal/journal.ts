// Journal d'audit : qui a fait quoi, quand. Les secrets n'y entrent jamais, même par mégarde.
import { Inject, Injectable } from '@nestjs/common';

import { BASE, type Base } from '../base/base.ts';
import { journalAudit } from '../base/schema.ts';

export type Origine = 'api' | 'cli' | 'worker';

export interface Evenement {
  origine: Origine;
  action: string;
  acteurId?: string | null;
  cibleId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export const MASQUE = '[masqué]';
const CLES_SECRETES = /mot.?de.?passe|password|jeton|token|secret|cookie|hash/i;

/** Remplace, à toute profondeur, la valeur des clés qui ressemblent à un secret. */
export function masquerSecrets(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(masquerSecrets);
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(
      Object.entries(valeur).map(([cle, v]) => [cle, CLES_SECRETES.test(cle) ? MASQUE : masquerSecrets(v)]),
    );
  }
  return valeur;
}

@Injectable()
export class Journal {
  constructor(@Inject(BASE) private readonly base: Base) {}

  async noter(e: Evenement): Promise<void> {
    await this.base.insert(journalAudit).values({
      origine: e.origine,
      action: e.action,
      acteurId: e.acteurId ?? null,
      cibleId: e.cibleId ?? null,
      details: masquerSecrets(e.details ?? {}) as Record<string, unknown>,
      ip: e.ip ?? null,
    });
  }
}
