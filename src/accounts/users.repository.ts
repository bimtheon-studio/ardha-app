import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { BASE, type Base } from '../db/db.ts';
import { type LigneUtilisateur, utilisateur } from '../db/schema.ts';

export type NouvelUtilisateur = Pick<LigneUtilisateur, 'email' | 'nom' | 'role' | 'motDePasseHash'>;

@Injectable()
export class UtilisateursRepository {
  constructor(@Inject(BASE) private readonly base: Base) {}

  async parEmail(email: string): Promise<LigneUtilisateur | undefined> {
    const [u] = await this.base.select().from(utilisateur).where(eq(utilisateur.email, email));
    return u;
  }

  async parId(id: string): Promise<LigneUtilisateur | undefined> {
    const [u] = await this.base.select().from(utilisateur).where(eq(utilisateur.id, id));
    return u;
  }

  /** Rend `undefined` si l'adresse est déjà prise (contrainte d'unicité), sans lever d'erreur. */
  async creer(nouvel: NouvelUtilisateur): Promise<LigneUtilisateur | undefined> {
    const [u] = await this.base.insert(utilisateur).values(nouvel).onConflictDoNothing({ target: utilisateur.email }).returning();
    return u;
  }

  async modifier(
    id: string,
    champs: Partial<Pick<LigneUtilisateur, 'motDePasseHash' | 'desactiveLe' | 'role' | 'nom'>>,
    maintenant: Date,
  ): Promise<void> {
    await this.base.update(utilisateur).set({ ...champs, modifieLe: maintenant }).where(eq(utilisateur.id, id));
  }

  lister(): Promise<LigneUtilisateur[]> {
    return this.base.select().from(utilisateur).orderBy(asc(utilisateur.creeLe));
  }
}
