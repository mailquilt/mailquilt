import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/**
 * The first of the four tables Better Auth reads and writes (with `sessions`,
 * `accounts` and `verifications`), named as it expects them: plural models
 * (`modelName` in its options) and snake_case columns (through Kysely's
 * `CamelCasePlugin`). Better Auth generates the IDs.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)]
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)]
);

/** One fixed-window counter per rate-limit key, for the `RateLimiter` port. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limits_reset_at_idx").on(table.resetAt)]
);

/** The tenant. Every Organization's data is scoped by its ID (`org_…`). */
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A user's place in an Organization (`mem_…`), with their role. */
export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("members_organization_id_user_id_key").on(
      table.organizationId,
      table.userId
    ),
    index("members_user_id_idx").on(table.userId),
    check(
      "members_role_check",
      sql`${table.role} in ('owner', 'admin', 'member')`
    ),
  ]
);

/**
 * One person in an Organization (`cnt_…`). The address is kept as entered and
 * unique per Organization regardless of case. `(organization_id, id)` is
 * unique so a Subscription's foreign keys can require its List and its
 * Contact to belong to the same Organization.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("contacts_organization_id_id_key").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("contacts_organization_id_email_key").on(
      table.organizationId,
      sql`lower(${table.email})`
    ),
  ]
);

/** A List (`lst_…`) that an Organization's Contacts can be subscribed to. */
export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("lists_organization_id_id_key").on(table.organizationId, table.id),
  ]
);

/**
 * A Contact's Subscription to one List (`sub_…`), with its status. Its
 * foreign keys include the Organization, so a List and a Contact from
 * different Organizations can't be joined.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    listId: text("list_id").notNull(),
    contactId: text("contact_id").notNull(),
    status: text("status").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("subscriptions_list_id_contact_id_key").on(
      table.listId,
      table.contactId
    ),
    index("subscriptions_list_id_id_idx").on(table.listId, table.id),
    index("subscriptions_organization_id_contact_id_idx").on(
      table.organizationId,
      table.contactId
    ),
    foreignKey({
      columns: [table.organizationId, table.listId],
      foreignColumns: [lists.organizationId, lists.id],
      name: "subscriptions_list_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
      name: "subscriptions_contact_fkey",
    }).onDelete("cascade"),
    check(
      "subscriptions_status_check",
      sql`${table.status} in ('pending', 'subscribed', 'unsubscribed')`
    ),
  ]
);
