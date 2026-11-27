import {
  CredentialCipher,
  currentOrganizationId,
  ProviderConnections,
} from "@repo/core";
import type { OrganizationId } from "@repo/domain";
import {
  CredentialsRequired,
  newProviderConnectionId,
  ProviderConnection,
  ProviderConnectionNotFound,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { providerConnections, sendSlots } from "./schema.ts";

const decodeConnection = Schema.decodeUnknownEffect(ProviderConnection);

const decodeConnections = Schema.decodeUnknownEffect(
  Schema.Array(ProviderConnection)
);

const CredentialsJson = Schema.fromJsonString(SmtpCredentials);

const encodeCredentials = Schema.encodeEffect(CredentialsJson);

const decodeCredentials = Schema.decodeEffect(CredentialsJson);

const encodeServer = Schema.encodeEffect(SmtpServer);

// WARNING: a Schema error quotes the value it failed on, here the credentials; replace it before it can reach a log.
const withoutCredentials = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError(
      () => new Error("Provider Connection credentials didn't convert")
    ),
    Effect.orDie
  );

const inOrganization = (organization: OrganizationId, id: string) =>
  and(
    eq(providerConnections.organizationId, organization),
    eq(providerConnections.id, id)
  );

const sealedFor = (organization: OrganizationId, id: string) =>
  `provider_connections:${organization}:${id}`;

interface ConnectionRow {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly fromName: string | null;
  readonly fromEmail: string;
  readonly settings: unknown;
  readonly signsIn: boolean;
  readonly emailsPerMinute: number | null;
  readonly createdAt: Date;
}

const connectionColumns = {
  createdAt: providerConnections.createdAt,
  emailsPerMinute: providerConnections.emailsPerMinute,
  fromEmail: providerConnections.fromEmail,
  fromName: providerConnections.fromName,
  id: providerConnections.id,
  name: providerConnections.name,
  provider: providerConnections.provider,
  settings: providerConnections.settings,
  signsIn: sql<boolean>`${providerConnections.credentials} is not null`,
};

const toConnection = (row: ConnectionRow) => ({
  createdAt: DateTime.fromDateUnsafe(row.createdAt),
  emailsPerMinute: row.emailsPerMinute,
  from:
    row.fromName === null
      ? { email: row.fromEmail }
      : { email: row.fromEmail, name: row.fromName },
  id: row.id,
  name: row.name,
  provider: row.provider,
  signsIn: row.signsIn,
  smtp: row.settings,
});

/**
 * An Organization's Provider Connections in Postgres. Credentials are sealed
 * before they are written and opened only by `withCredentials`, so nothing
 * else ever holds them in plain text. Every query is scoped to the request's
 * `CurrentOrganization`. A failed query, or credentials that no longer open,
 * is a defect.
 */
export const ProviderConnectionsLive = Layer.effect(
  ProviderConnections,
  Effect.gen(function* providerConnectionsRepository() {
    const db = yield* Database;
    const cipher = yield* CredentialCipher;
    const random = yield* SecureRandom.SecureRandom;

    const sealedColumns = (
      organization: OrganizationId,
      id: string,
      credentials: Option.Option<typeof SmtpCredentials.Type>
    ) =>
      Option.match(credentials, {
        onNone: () =>
          Effect.succeed({ credentials: null, credentialsKeyVersion: null }),
        onSome: (opened) =>
          withoutCredentials(encodeCredentials(opened)).pipe(
            Effect.flatMap((json) =>
              cipher.seal(Redacted.make(json), sealedFor(organization, id))
            ),
            Effect.map((sealed) => ({
              credentials: sealed.value,
              credentialsKeyVersion: sealed.keyVersion,
            }))
          ),
      });

    return {
      all: Effect.gen(function* allConnections() {
        const organization = yield* currentOrganizationId;

        const rows = yield* db
          .select(connectionColumns)
          .from(providerConnections)
          .where(eq(providerConnections.organizationId, organization))
          .orderBy(
            asc(providerConnections.createdAt),
            asc(providerConnections.id)
          );

        return yield* decodeConnections(rows.map(toConnection));
      }).pipe(Effect.orDie),

      create: (connection) =>
        Effect.gen(function* createConnection() {
          const organization = yield* currentOrganizationId;

          const id = yield* newProviderConnectionId.pipe(
            Effect.provideService(SecureRandom.SecureRandom, random)
          );

          const sealed = yield* sealedColumns(
            organization,
            id,
            connection.credentials
          );

          const [created] = yield* db
            .insert(providerConnections)
            .values({
              ...sealed,
              emailsPerMinute: Option.getOrNull(connection.emailsPerMinute),
              fromEmail: connection.from.email,
              fromName: connection.from.name ?? null,
              id,
              name: connection.name,
              organizationId: organization,
              provider: "smtp",
              settings: yield* encodeServer(connection.smtp),
            })
            .returning(connectionColumns);

          if (created === undefined) {
            return yield* Effect.die(
              new Error("Inserting a Provider Connection returned no row")
            );
          }

          return yield* decodeConnection(toConnection(created));
        }).pipe(Effect.orDie),

      remove: (id) =>
        Effect.gen(function* removeConnection() {
          const organization = yield* currentOrganizationId;

          const removed = yield* db
            .delete(providerConnections)
            .where(inOrganization(organization, id))
            .returning({ id: providerConnections.id })
            .pipe(Effect.orDie);

          if (removed.length === 0) {
            return yield* new ProviderConnectionNotFound();
          }
        }),

      // WARNING: a concurrent take of the same slot waits for this one's row lock and then moves on from the slot this one left, so no two emails share a slot. `for key share` makes a delete committing meanwhile leave nothing to insert, rather than fail the foreign key.
      takeSendSlot: (id, interval, now) =>
        Effect.gen(function* takeSendSlot() {
          const organization = yield* currentOrganizationId;
          const step = sql`${Duration.toMillis(interval)}::float8 * interval '1 millisecond'`;
          const from = sql`${DateTime.formatIso(now)}::timestamptz`;

          const { rows } = yield* db.execute<{ readonly startsAt: number }>(sql`
            insert into ${sendSlots} (organization_id, provider_connection_id, next_at)
            select organization_id, id, ${from} + ${step}
            from ${providerConnections}
            where organization_id = ${organization} and id = ${id}
            for key share
            on conflict (organization_id, provider_connection_id) do update
            set next_at = greatest(${sendSlots.nextAt}, ${from}) + ${step}
            returning (extract(epoch from next_at - ${step}) * 1000)::float8 as "startsAt"
          `);

          return Option.map(Option.fromUndefinedOr(rows[0]), (row) =>
            DateTime.makeUnsafe(row.startsAt)
          );
        }).pipe(Effect.orDie),

      update: (id, changes) =>
        Effect.gen(function* updateConnection() {
          const organization = yield* currentOrganizationId;

          const settings = yield* encodeServer(changes.smtp).pipe(Effect.orDie);

          const credentials =
            changes.credentials === "keep"
              ? {}
              : yield* sealedColumns(organization, id, changes.credentials);

          const emailsPerMinute =
            changes.emailsPerMinute === "keep"
              ? {}
              : { emailsPerMinute: Option.getOrNull(changes.emailsPerMinute) };

          const keptOnlyForTheSameServer =
            changes.credentials === "keep"
              ? or(
                  isNull(providerConnections.credentials),
                  sql`${providerConnections.settings} = ${JSON.stringify(settings)}::jsonb`
                )
              : undefined;

          const [updated] = yield* db
            .update(providerConnections)
            .set({
              ...credentials,
              ...emailsPerMinute,
              fromEmail: changes.from.email,
              fromName: changes.from.name ?? null,
              name: changes.name,
              settings,
              updatedAt: sql`now()`,
            })
            .where(
              and(inOrganization(organization, id), keptOnlyForTheSameServer)
            )
            .returning(connectionColumns)
            .pipe(Effect.orDie);

          if (updated === undefined) {
            const [exists] = yield* db
              .select({ id: providerConnections.id })
              .from(providerConnections)
              .where(inOrganization(organization, id))
              .pipe(Effect.orDie);

            return yield* exists === undefined
              ? new ProviderConnectionNotFound()
              : new CredentialsRequired();
          }

          return yield* decodeConnection(toConnection(updated)).pipe(
            Effect.orDie
          );
        }),

      withCredentials: (id) =>
        Effect.gen(function* connectionWithCredentials() {
          const organization = yield* currentOrganizationId;

          const [row] = yield* db
            .select({
              ...connectionColumns,
              credentials: providerConnections.credentials,
              credentialsKeyVersion: providerConnections.credentialsKeyVersion,
            })
            .from(providerConnections)
            .where(
              and(
                eq(providerConnections.organizationId, organization),
                eq(providerConnections.id, id)
              )
            )
            .pipe(Effect.orDie);

          if (row === undefined) {
            return yield* new ProviderConnectionNotFound();
          }

          const connection = yield* decodeConnection(toConnection(row)).pipe(
            Effect.orDie
          );

          if (row.credentials === null || row.credentialsKeyVersion === null) {
            return { connection, credentials: Option.none() };
          }

          const json = yield* cipher
            .open(
              { keyVersion: row.credentialsKeyVersion, value: row.credentials },
              sealedFor(organization, row.id)
            )
            .pipe(Effect.orDie);

          const credentials = yield* withoutCredentials(
            decodeCredentials(Redacted.value(json))
          );

          return { connection, credentials: Option.some(credentials) };
        }),
    };
  })
);
