import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { DB, type Db } from '../db/db.ts';
import { type UserRow, user } from '../db/schema.ts';

export type NewUser = Pick<UserRow, 'email' | 'name' | 'role' | 'passwordHash'>;

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async byEmail(email: string): Promise<UserRow | undefined> {
    const [u] = await this.db.select().from(user).where(eq(user.email, email));
    return u;
  }

  async byId(id: string): Promise<UserRow | undefined> {
    const [u] = await this.db.select().from(user).where(eq(user.id, id));
    return u;
  }

  /** Rend `undefined` si l'adresse est déjà prise (contrainte d'unicité), sans lever d'erreur. */
  async create(newUser: NewUser): Promise<UserRow | undefined> {
    const [u] = await this.db.insert(user).values(newUser).onConflictDoNothing({ target: user.email }).returning();
    return u;
  }

  async update(
    id: string,
    fields: Partial<Pick<UserRow, 'passwordHash' | 'deactivatedAt' | 'role' | 'name'>>,
    now: Date,
  ): Promise<void> {
    await this.db.update(user).set({ ...fields, updatedAt: now }).where(eq(user.id, id));
  }

  list(): Promise<UserRow[]> {
    return this.db.select().from(user).orderBy(asc(user.createdAt));
  }
}
