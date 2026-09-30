import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lte, or } from 'drizzle-orm';

import { BASE, type Base } from '../base/base.ts';
import { type LigneSession, type LigneUtilisateur, session, utilisateur } from '../base/schema.ts';

export type NouvelleSession = Pick<
  LigneSession,
  'utilisateurId' | 'jetonHash' | 'expireLe' | 'expireAuPlusTardLe' | 'ip' | 'agentUtilisateur' | 'creeLe' | 'derniereActiviteLe'
>;

@Injectable()
export class SessionsRepository {
  constructor(@Inject(BASE) private readonly base: Base) {}

  async creer(nouvelle: NouvelleSession): Promise<LigneSession> {
    const [s] = await this.base.insert(session).values(nouvelle).returning();
    return s!;
  }

  async parEmpreinte(jetonHash: string): Promise<{ session: LigneSession; utilisateur: LigneUtilisateur } | undefined> {
    const [ligne] = await this.base
      .select({ session, utilisateur })
      .from(session)
      .innerJoin(utilisateur, eq(utilisateur.id, session.utilisateurId))
      .where(eq(session.jetonHash, jetonHash));
    return ligne;
  }

  async prolonger(id: string, expireLe: Date, maintenant: Date): Promise<void> {
    await this.base.update(session).set({ expireLe, derniereActiviteLe: maintenant }).where(eq(session.id, id));
  }

  async supprimer(id: string): Promise<void> {
    await this.base.delete(session).where(eq(session.id, id));
  }

  /** Ferme toutes les sessions d'un utilisateur ; rend leur nombre. */
  async supprimerDe(utilisateurId: string): Promise<number> {
    const r = await this.base.delete(session).where(eq(session.utilisateurId, utilisateurId)).returning({ id: session.id });
    return r.length;
  }

  async purgerExpirees(maintenant: Date): Promise<number> {
    const r = await this.base
      .delete(session)
      .where(or(lte(session.expireLe, maintenant), lte(session.expireAuPlusTardLe, maintenant)))
      .returning({ id: session.id });
    return r.length;
  }

  /** Pour les tests et la CLI : sessions d'un utilisateur. */
  de(utilisateurId: string): Promise<LigneSession[]> {
    return this.base.select().from(session).where(and(eq(session.utilisateurId, utilisateurId)));
  }
}
