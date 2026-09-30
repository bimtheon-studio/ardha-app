// Schéma de la base, décrit pour Drizzle. Tables au pluriel (`user` est un mot réservé de
// PostgreSQL), colonnes en snake_case déduites des clés (`casing: 'snake_case'`). Doctrine « base
// bête » : tables, types, index, clés, contraintes ; jamais de logique en base. Seuls les défauts
// `uuidv7()` et `now()`, natifs de PostgreSQL 18.
import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().default(sql`uuidv7()`);
const timestampTz = () => timestamp({ withTimezone: true, mode: 'date' });

export const userRole = pgEnum('user_role', ['admin', 'user']);
export const auditOrigin = pgEnum('audit_origin', ['api', 'cli', 'worker']);

/** Données client : les comptes. */
export const user = pgTable('users', {
  id: id(),
  /** Normalisée (minuscules, sans espaces) : l'unicité porte sur cette forme. */
  email: text().notNull().unique('users_email_unique'),
  name: text().notNull(),
  /** Hash argon2id. Nul pour un compte créé par la CLI dont le mot de passe reste à choisir par lien. */
  passwordHash: text(),
  role: userRole().notNull().default('user'),
  deactivatedAt: timestampTz(),
  createdAt: timestampTz().notNull().defaultNow(),
  updatedAt: timestampTz().notNull().defaultNow(),
});

/** Sessions ouvertes. Le jeton n'est gardé que haché (SHA-256) : une fuite de la table n'ouvre rien. */
export const session = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull().unique('sessions_token_hash_unique'),
    createdAt: timestampTz().notNull().defaultNow(),
    lastActivityAt: timestampTz().notNull().defaultNow(),
    expiresAt: timestampTz().notNull(),
    absoluteExpiresAt: timestampTz().notNull(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [index().on(t.userId), index().on(t.expiresAt)],
);

/** Liens de réinitialisation du mot de passe, créés par la CLI, à usage unique. */
export const passwordReset = pgTable(
  'password_resets',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull().unique('password_resets_token_hash_unique'),
    createdAt: timestampTz().notNull().defaultNow(),
    expiresAt: timestampTz().notNull(),
    usedAt: timestampTz(),
  },
  (t) => [index().on(t.userId)],
);

/** Qui a fait quoi, quand. Jamais de secret dans `details` (voir `AuditLog`). */
export const auditLog = pgTable(
  'audit_logs',
  {
    id: id(),
    createdAt: timestampTz().notNull().defaultNow(),
    origin: auditOrigin().notNull(),
    actorId: uuid().references(() => user.id, { onDelete: 'set null' }),
    action: text().notNull(),
    targetId: uuid(),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
  },
  (t) => [index().on(t.createdAt), index().on(t.actorId), index().on(t.action)],
);

export type UserRow = typeof user.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type PasswordResetRow = typeof passwordReset.$inferSelect;
