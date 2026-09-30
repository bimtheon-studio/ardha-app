// Schéma de la base, décrit pour Drizzle. Les colonnes sont en camelCase ici et en snake_case en
// base (`casing: 'snake_case'`). Doctrine « base bête » : tables, types, index, clés, contraintes ;
// jamais de logique en base. Seuls les défauts `uuidv7()` et `now()`, natifs de PostgreSQL 18.
import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().default(sql`uuidv7()`);
const horodatage = () => timestamp({ withTimezone: true, mode: 'date' });

export const roleUtilisateur = pgEnum('role_utilisateur', ['admin', 'utilisateur']);
export const origineAudit = pgEnum('origine_audit', ['api', 'cli', 'worker']);

/** Données client : les comptes. */
export const utilisateur = pgTable('utilisateur', {
  id: id(),
  /** Normalisée (minuscules, sans espaces) : l'unicité porte sur cette forme. */
  email: text().notNull().unique('utilisateur_email_unique'),
  nom: text().notNull(),
  /** Hash argon2id. Nul pour un compte créé par la CLI dont le mot de passe reste à choisir par lien. */
  motDePasseHash: text(),
  role: roleUtilisateur().notNull().default('utilisateur'),
  desactiveLe: horodatage(),
  creeLe: horodatage().notNull().defaultNow(),
  modifieLe: horodatage().notNull().defaultNow(),
});

/** Sessions ouvertes. Le jeton n'est gardé que haché (SHA-256) : une fuite de la table n'ouvre rien. */
export const session = pgTable(
  'session',
  {
    id: id(),
    utilisateurId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: 'cascade' }),
    jetonHash: text().notNull().unique('session_jeton_hash_unique'),
    creeLe: horodatage().notNull().defaultNow(),
    derniereActiviteLe: horodatage().notNull().defaultNow(),
    expireLe: horodatage().notNull(),
    expireAuPlusTardLe: horodatage().notNull(),
    ip: text(),
    agentUtilisateur: text(),
  },
  (t) => [index().on(t.utilisateurId), index().on(t.expireLe)],
);

/** Liens de réinitialisation du mot de passe, créés par la CLI, à usage unique. */
export const reinitialisationMotDePasse = pgTable(
  'reinitialisation_mot_de_passe',
  {
    id: id(),
    utilisateurId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: 'cascade' }),
    jetonHash: text().notNull().unique('reinitialisation_mot_de_passe_jeton_hash_unique'),
    creeLe: horodatage().notNull().defaultNow(),
    expireLe: horodatage().notNull(),
    utiliseLe: horodatage(),
  },
  (t) => [index().on(t.utilisateurId)],
);

/** Qui a fait quoi, quand. Jamais de secret dans `details` (voir `JournalService`). */
export const journalAudit = pgTable(
  'journal_audit',
  {
    id: id(),
    creeLe: horodatage().notNull().defaultNow(),
    origine: origineAudit().notNull(),
    acteurId: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),
    action: text().notNull(),
    cibleId: uuid(),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
  },
  (t) => [index().on(t.creeLe), index().on(t.acteurId), index().on(t.action)],
);

export type LigneUtilisateur = typeof utilisateur.$inferSelect;
export type LigneSession = typeof session.$inferSelect;
export type LigneReinitialisation = typeof reinitialisationMotDePasse.$inferSelect;
