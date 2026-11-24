import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
  /** Can see and change the install's settings. Better Auth shows it in the session and never lets sign-up set it. */
  instanceAdmin: boolean("instance_admin").notNull().default(false),
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

/**
 * The install itself: one row, written by first-run setup in the same
 * transaction as the instance admin, so setup can never run twice. Who may
 * sign up, and the System Mailer saved on the settings page. The System
 * Mailer's `credentials` are sealed like a Provider Connection's (ADR 0009),
 * bound to `instance:system_mailer`.
 */
export const instance = pgTable(
  "instance",
  {
    id: boolean("id").primaryKey().default(true),
    signUp: text("sign_up").notNull().default("invite-only"),
    systemMailerFromName: text("system_mailer_from_name"),
    systemMailerFromEmail: text("system_mailer_from_email"),
    systemMailerSmtp: jsonb("system_mailer_smtp"),
    systemMailerCredentials: text("system_mailer_credentials"),
    systemMailerCredentialsKeyVersion: integer(
      "system_mailer_credentials_key_version"
    ),
    setUpAt: timestamp("set_up_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("instance_id_check", sql`${table.id}`),
    check(
      "instance_sign_up_check",
      sql`${table.signUp} in ('invite-only', 'open')`
    ),
    check(
      "instance_system_mailer_check",
      sql`(${table.systemMailerFromEmail} is null) = (${table.systemMailerSmtp} is null)`
    ),
    check(
      "instance_system_mailer_credentials_check",
      sql`(${table.systemMailerCredentials} is null) = (${table.systemMailerCredentialsKeyVersion} is null) and (${table.systemMailerCredentials} is null or ${table.systemMailerSmtp} is not null)`
    ),
  ]
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

/**
 * An Organization's configured sending service (`pcn_…`). `settings` holds
 * where it sends, such as an SMTP server's host, port and encryption, and
 * never a secret. `credentials` is sealed with AES-256-GCM under the key
 * numbered `credentials_key_version`, bound to this row's Organization and
 * ID (ADR 0009); both are null for a server that needs no sign-in.
 */
export const providerConnections = pgTable(
  "provider_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    fromName: text("from_name"),
    fromEmail: text("from_email").notNull(),
    settings: jsonb("settings").notNull(),
    credentials: text("credentials"),
    credentialsKeyVersion: integer("credentials_key_version"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("provider_connections_organization_id_id_key").on(
      table.organizationId,
      table.id
    ),
    check(
      "provider_connections_provider_check",
      sql`${table.provider} in ('smtp')`
    ),
    check(
      "provider_connections_credentials_check",
      sql`(${table.credentials} is null) = (${table.credentialsKeyVersion} is null)`
    ),
  ]
);

/**
 * One email (`cmp_…`) holding its own copy of its content, sent once to one
 * List through one Provider Connection. Deleting that Provider Connection
 * leaves the Campaign without one (`provider_connection_id` null), so a draft
 * asks for another and a send in progress stops at its next batch.
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    fromName: text("from_name"),
    fromEmail: text("from_email").notNull(),
    replyTo: text("reply_to"),
    listId: text("list_id").notNull(),
    providerConnectionId: text("provider_connection_id"),
    html: text("html").notNull(),
    status: text("status").notNull().default("draft"),
    sendingStartedAt: timestamp("sending_started_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("campaigns_organization_id_id_key").on(
      table.organizationId,
      table.id
    ),
    foreignKey({
      columns: [table.organizationId, table.listId],
      foreignColumns: [lists.organizationId, lists.id],
      name: "campaigns_list_fkey",
    }),
    // WARNING: the migration narrows this to `on delete set null (provider_connection_id)`, which Drizzle can't declare; a regenerated migration would null `organization_id` too.
    foreignKey({
      columns: [table.organizationId, table.providerConnectionId],
      foreignColumns: [
        providerConnections.organizationId,
        providerConnections.id,
      ],
      name: "campaigns_provider_connection_fkey",
    }).onDelete("set null"),
    check(
      "campaigns_status_check",
      sql`${table.status} in ('draft', 'sending', 'sent')`
    ),
  ]
);

/**
 * The Contacts a Campaign goes to, fixed in one query when it starts sending,
 * with the address each had then. `batch` groups them into the queue messages
 * that send them. Each starts `queued`, and becomes `sent`, with the
 * Provider's message ID, or `failed`, with why.
 */
export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    organizationId: text("organization_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    contactId: text("contact_id").notNull(),
    email: text("email").notNull(),
    batch: integer("batch").notNull(),
    status: text("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    failureReason: text("failure_reason"),
    failureDetail: text("failure_detail"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.contactId] }),
    index("campaign_recipients_campaign_id_batch_idx").on(
      table.campaignId,
      table.batch
    ),
    foreignKey({
      columns: [table.organizationId, table.campaignId],
      foreignColumns: [campaigns.organizationId, campaigns.id],
      name: "campaign_recipients_campaign_fkey",
    }).onDelete("cascade"),
    check(
      "campaign_recipients_status_check",
      sql`${table.status} in ('queued', 'sent', 'failed')`
    ),
  ]
);

/**
 * What happened to each email a Campaign sent, such as `sent`. Partitioned by
 * month of `occurred_at` in its hand-written migration, which Drizzle can't
 * declare; `create_delivery_event_partitions` makes the coming months'
 * partitions, and a scheduled job calls it. Events are dropped a month at a
 * time, by partition.
 */
export const deliveryEvents = pgTable(
  "delivery_events",
  {
    id: bigserial("id", { mode: "number" }),
    organizationId: text("organization_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    contactId: text("contact_id").notNull(),
    kind: text("kind").notNull(),
    providerMessageId: text("provider_message_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.occurredAt, table.id] }),
    index("delivery_events_campaign_id_idx").on(table.campaignId),
    foreignKey({
      columns: [table.organizationId, table.campaignId],
      foreignColumns: [campaigns.organizationId, campaigns.id],
      name: "delivery_events_campaign_fkey",
    }).onDelete("cascade"),
    check("delivery_events_kind_check", sql`${table.kind} in ('sent')`),
  ]
);
