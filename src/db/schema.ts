// Schéma de la base, décrit pour Drizzle. Le code est en anglais, le modèle en base en français
// (PLAN §4) : chaque colonne dont le nom diffère porte son nom en base. Doctrine « base bête » :
// tables, types, index, clés, contraintes ; jamais de logique en base. Seuls les défauts `uuidv7()`
// et `now()`, natifs de PostgreSQL 18.
import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().default(sql`uuidv7()`);
const timestampTz = (column: string) => timestamp(column, { withTimezone: true, mode: 'date' });

export const userRole = pgEnum('role_utilisateur', ['admin', 'utilisateur']);
export const auditOrigin = pgEnum('origine_audit', ['api', 'cli', 'worker']);

/** Données client : les comptes. */
export const user = pgTable('utilisateur', {
  id: id(),
  /** Normalisée (minuscules, sans espaces) : l'unicité porte sur cette forme. */
  email: text().notNull().unique('utilisateur_email_unique'),
  name: text('nom').notNull(),
  /** Hash argon2id. Nul pour un compte créé par la CLI dont le mot de passe reste à choisir par lien. */
  passwordHash: text('mot_de_passe_hash'),
  role: userRole().notNull().default('utilisateur'),
  deactivatedAt: timestampTz('desactive_le'),
  createdAt: timestampTz('cree_le').notNull().defaultNow(),
  updatedAt: timestampTz('modifie_le').notNull().defaultNow(),
});

/** Sessions ouvertes. Le jeton n'est gardé que haché (SHA-256) : une fuite de la table n'ouvre rien. */
export const session = pgTable(
  'session',
  {
    id: id(),
    userId: uuid('utilisateur_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('jeton_hash').notNull().unique('session_jeton_hash_unique'),
    createdAt: timestampTz('cree_le').notNull().defaultNow(),
    lastActivityAt: timestampTz('derniere_activite_le').notNull().defaultNow(),
    expiresAt: timestampTz('expire_le').notNull(),
    absoluteExpiresAt: timestampTz('expire_au_plus_tard_le').notNull(),
    ip: text(),
    userAgent: text('agent_utilisateur'),
  },
  (t) => [index().on(t.userId), index().on(t.expiresAt)],
);

/** Liens de réinitialisation du mot de passe, créés par la CLI, à usage unique. */
export const passwordReset = pgTable(
  'reinitialisation_mot_de_passe',
  {
    id: id(),
    userId: uuid('utilisateur_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('jeton_hash').notNull().unique('reinitialisation_mot_de_passe_jeton_hash_unique'),
    createdAt: timestampTz('cree_le').notNull().defaultNow(),
    expiresAt: timestampTz('expire_le').notNull(),
    usedAt: timestampTz('utilise_le'),
  },
  (t) => [index().on(t.userId)],
);

/** Qui a fait quoi, quand. Jamais de secret dans `details` (voir `AuditLog`). */
export const auditLog = pgTable(
  'journal_audit',
  {
    id: id(),
    createdAt: timestampTz('cree_le').notNull().defaultNow(),
    origin: auditOrigin('origine').notNull(),
    actorId: uuid('acteur_id').references(() => user.id, { onDelete: 'set null' }),
    action: text().notNull(),
    targetId: uuid('cible_id'),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
  },
  (t) => [index().on(t.createdAt), index().on(t.actorId), index().on(t.action)],
);

export type UserRow = typeof user.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type PasswordResetRow = typeof passwordReset.$inferSelect;
