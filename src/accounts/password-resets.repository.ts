import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';

import { BASE, type Base } from '../db/db.ts';
import { type LigneReinitialisation, reinitialisationMotDePasse as reinit } from '../db/schema.ts';

@Injectable()
export class ReinitialisationsRepository {
  constructor(@Inject(BASE) private readonly base: Base) {}

  async creer(utilisateurId: string, jetonHash: string, creeLe: Date, expireLe: Date): Promise<LigneReinitialisation> {
    const [r] = await this.base.insert(reinit).values({ utilisateurId, jetonHash, creeLe, expireLe }).returning();
    return r!;
  }

  async parEmpreinte(jetonHash: string): Promise<LigneReinitialisation | undefined> {
    const [r] = await this.base.select().from(reinit).where(eq(reinit.jetonHash, jetonHash));
    return r;
  }

  /**
   * Consomme un lien encore valable, en une seule requête : deux utilisations simultanées du même
   * lien ne peuvent pas réussir toutes les deux.
   */
  async consommer(jetonHash: string, maintenant: Date): Promise<LigneReinitialisation | undefined> {
    const [r] = await this.base
      .update(reinit)
      .set({ utiliseLe: maintenant })
      .where(and(eq(reinit.jetonHash, jetonHash), isNull(reinit.utiliseLe), gt(reinit.expireLe, maintenant)))
      .returning();
    return r;
  }

  /** Invalide les liens encore ouverts d'un utilisateur (un nouveau lien remplace l'ancien). */
  async annulerOuverts(utilisateurId: string, maintenant: Date): Promise<void> {
    await this.base
      .update(reinit)
      .set({ utiliseLe: maintenant })
      .where(and(eq(reinit.utilisateurId, utilisateurId), isNull(reinit.utiliseLe)));
  }

  async purger(maintenant: Date): Promise<number> {
    const r = await this.base
      .delete(reinit)
      .where(or(lte(reinit.expireLe, maintenant), isNotNull(reinit.utiliseLe)))
      .returning({ id: reinit.id });
    return r.length;
  }
}
