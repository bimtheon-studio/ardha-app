// Schéma de la base, décrit pour Drizzle. Tables au pluriel (`user` est un mot réservé de
// PostgreSQL), colonnes en snake_case déduites des clés (`casing: 'snake_case'`). Doctrine « base
// bête » : tables, types, index, clés, contraintes ; jamais de logique en base. Seuls les défauts
// `uuidv7()` et `now()`, natifs de PostgreSQL 18.
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type { Address } from '../contracts/geo.ts';

const id = () => uuid().primaryKey().default(sql`uuidv7()`);
const timestampTz = () => timestamp({ withTimezone: true, mode: 'date' });

/**
 * Surface PostGIS en WGS84. Drizzle ne connaît que les points : les repositories lisent par
 * `ST_AsGeoJSON` et écrivent par `ST_GeomFromGeoJSON`.
 */
const multiPolygon = customType<{ data: string; driverData: string }>({
  dataType: () => 'geometry(MultiPolygon, 4326)',
});
// Le type `geometry` de Drizzle perd le SRID en migration : point décrit à la main, lu par ST_X / ST_Y.
const point = customType<{ data: string; driverData: string }>({ dataType: () => 'geometry(Point, 4326)' });

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

/** Données de référence : les communes dont on a chargé au moins une source (geo.api.gouv.fr). */
export const commune = pgTable('communes', {
  /** Code INSEE (`94046`, `2A004`, `75111` pour un arrondissement). */
  code: text().primaryKey(),
  name: text().notNull(),
  departmentCode: text().notNull(),
  postcodes: text().array().notNull().default(sql`'{}'::text[]`),
  /** `[longitude, latitude]`. */
  center: point(),
  contour: multiPolygon(),
  updatedAt: timestampTz().notNull().defaultNow(),
});

/** Données de référence : le cadastre Etalab, chargé commune par commune, remplacé à chaque millésime. */
export const parcel = pgTable(
  'parcels',
  {
    /** IDU, 14 caractères. */
    id: text().primaryKey(),
    communeCode: text()
      .notNull()
      .references(() => commune.code, { onDelete: 'cascade' }),
    prefix: text().notNull(),
    section: text().notNull(),
    number: text().notNull(),
    /** Contenance cadastrale, en m² ; parfois absente. */
    contenance: integer(),
    geometry: multiPolygon().notNull(),
    /** Millésime du cadastre Etalab (`2026-09-01`). */
    version: text().notNull(),
  },
  (t) => [index().on(t.communeCode), index('parcels_geometry_index').using('gist', t.geometry)],
);

export const sourceStatus = pgEnum('source_status', ['queued', 'loading', 'ready', 'failed']);

/**
 * État d'une source de référence sur un périmètre (le cadastre d'une commune…) : ce que le worker
 * a chargé, quand, et ce qui reste à faire. L'état du travail vit ici, pas dans Redis (PLAN §3).
 */
export const sourceState = pgTable(
  'source_states',
  {
    source: text().notNull(),
    /** Périmètre : code INSEE pour le cadastre. */
    scope: text().notNull(),
    status: sourceStatus().notNull(),
    /** Version chargée (millésime), gardée pendant un rechargement. */
    version: text(),
    itemCount: integer(),
    requestedAt: timestampTz().notNull().defaultNow(),
    startedAt: timestampTz(),
    loadedAt: timestampTz(),
    attempts: integer().notNull().default(0),
    error: text(),
    updatedAt: timestampTz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.source, t.scope] }), index().on(t.status)],
);

/**
 * Données client : une étude (F-02). Ses parcelles sont copiées dans `study_parcels` ; l'adresse et
 * la vignette sont calculées par le worker pour une empreinte des parcelles (`parcels_key`) : elles
 * sont en retard tant que `address_key` ou `thumbnail_key` en diffère.
 */
export const study = pgTable(
  'studies',
  {
    id: id(),
    ownerId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /** Vrai tant que le nom attend l'adresse ; faux une fois proposé par le worker, ou renommé (Q2). */
    nameIsProvisional: boolean().notNull().default(true),
    /** Commune qui porte la plus grande part de la surface. */
    communeCode: text().notNull(),
    communeName: text(),
    /** Adresse retenue (BAN), copiée. */
    address: jsonb().$type<Address>(),
    /** Adresses rattachées aux parcelles, la principale en tête (Q3). */
    addresses: jsonb().$type<Address[]>().notNull().default([]),
    /** Adresse choisie par l'utilisateur, gardée tant qu'elle est trouvée. */
    chosenAddressId: text(),
    parcelsKey: text().notNull(),
    addressKey: text(),
    thumbnailKey: text(),
    /** Dans la corbeille depuis (Q9). */
    deletedAt: timestampTz(),
    createdAt: timestampTz().notNull().defaultNow(),
    updatedAt: timestampTz().notNull().defaultNow(),
  },
  (t) => [index().on(t.ownerId, t.updatedAt), index().on(t.deletedAt)],
);

/**
 * Parcelles d'une étude, copiées depuis le cadastre avec leur millésime. Pas de clé vers `parcels` :
 * la référence se remplace à chaque millésime, l'étude garde ce qu'elle a vu (PLAN §4).
 */
export const studyParcel = pgTable(
  'study_parcels',
  {
    studyId: uuid()
      .notNull()
      .references(() => study.id, { onDelete: 'cascade' }),
    /** IDU, 14 caractères. */
    parcelId: text().notNull(),
    /** Ordre d'ajout. */
    position: integer().notNull(),
    communeCode: text().notNull(),
    prefix: text().notNull(),
    section: text().notNull(),
    number: text().notNull(),
    contenance: integer(),
    /** Surface calculée (géodésique), en m². */
    area: doublePrecision().notNull(),
    geometry: multiPolygon().notNull(),
    /** Millésime du cadastre copié (`2026-09-01`). */
    version: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.studyId, t.parcelId] })],
);

export type UserRow = typeof user.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type PasswordResetRow = typeof passwordReset.$inferSelect;
export type SourceStateRow = typeof sourceState.$inferSelect;
export type StudyRow = typeof study.$inferSelect;
