import {
  CredentialCipher,
  currentOrganizationId,
  ProviderConnections,
} from "@repo/core";
import type {
  NewProviderConnection,
  ProviderConnectionChanges,
  ProviderConnectionWithCredentials,
} from "@repo/core";
import type { OrganizationId } from "@repo/domain";
import {
  CredentialsRequired,
  newProviderConnectionId,
  ProviderConnectionSchema,
  ProviderConnectionNotFound,
  SesAccount,
  SesCredentials,
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
import { organizations, providerConnections, sendSlots } from "./schema.ts";

const decodeConnection = Schema.decodeUnknownEffect(ProviderConnectionSchema);

const decodeConnections = Schema.decodeUnknownEffect(
  Schema.Array(ProviderConnectionSchema)
);

const SmtpCredentialsJson = Schema.fromJsonString(SmtpCredentials);

const SesCredentialsJson = Schema.fromJsonString(SesCredentials);

const encodeSmtpCredentials = Schema.encodeEffect(SmtpCredentialsJson);

const decodeSmtpCredentials = Schema.decodeEffect(SmtpCredentialsJson);

const encodeSesCredentials = Schema.encodeEffect(SesCredentialsJson);

const decodeSesCredentials = Schema.decodeEffect(SesCredentialsJson);

const encodeServer = Schema.encodeEffect(SmtpServer);

const encodeAccount = Schema.encodeEffect(SesAccount);

// WARNING: a Schema error quotes the value it failed on, here the credentials; replace it before it can reach a log.
const withoutCredentials = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError(
      () => new Error("Provider Connection credentials didn't convert")
    ),
    Effect.orDie
  );

type Target = NewProviderConnection | ProviderConnectionChanges;

type NewCredentials =
  | {
      readonly provider: "smtp";
      readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
    }
  | {
      readonly provider: "ses";
      readonly credentials: typeof SesCredentials.Type;
    };

const enteredCredentials = (changes: ProviderConnectionChanges) => {
  if (changes.provider === "ses") {
    return changes.credentials === "keep"
      ? Option.none<NewCredentials>()
      : Option.some<NewCredentials>({
          credentials: changes.credentials,
          provider: "ses",
        });
  }

  return changes.credentials === "keep"
    ? Option.none<NewCredentials>()
    : Option.some<NewCredentials>({
        credentials: changes.credentials,
        provider: "smtp",
      });
};

const settingsOf = (target: Target) =>
  Effect.gen(function* settingsOfTarget() {
    if (target.provider === "ses") {
      return yield* encodeAccount(target.ses);
    }

    return yield* encodeServer(target.smtp);
  }).pipe(Effect.orDie);

// WARNING: credentials are encoded with `withoutCredentials`, since an encoding error would quote them.
const credentialsJsonOf = (target: NewCredentials) =>
  withoutCredentials(
    Effect.gen(function* credentialsJson() {
      if (target.provider === "ses") {
        return Option.some(yield* encodeSesCredentials(target.credentials));
      }

      if (Option.isNone(target.credentials)) {
        return Option.none<string>();
      }

      return Option.some(
        yield* encodeSmtpCredentials(target.credentials.value)
      );
    })
  );

// WARNING: only SMTP uses a bounce address, so a move to SES turns it off.
const bounceAddressOf = (changes: ProviderConnectionChanges) => {
  if (changes.provider === "ses") {
    return { usesBounceAddress: false };
  }

  if (changes.usesBounceAddress === "keep") {
    return {};
  }

  return { usesBounceAddress: changes.usesBounceAddress };
};

const inOrganization = (organization: OrganizationId, id: string) =>
  and(
    eq(providerConnections.organizationId, organization),
    eq(providerConnections.id, id)
  );

const sealedFor = (organization: OrganizationId, id: string) =>
  `provider_connections:${organization}:${id}`;

interface SealedColumns {
  readonly credentials: string | null;
  readonly credentialsKeyVersion: number | null;
}

interface ConnectionRow {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly fromName: string | null;
  readonly fromEmail: string;
  readonly settings: unknown;
  readonly signsIn: boolean;
  readonly emailsPerMinute: number | null;
  readonly defaultForCampaigns: boolean;
  readonly usesBounceAddress: boolean;
  readonly createdAt: Date;
}

const connectionColumns = {
  createdAt: providerConnections.createdAt,
  defaultForCampaigns: providerConnections.defaultForCampaigns,
  emailsPerMinute: providerConnections.emailsPerMinute,
  fromEmail: providerConnections.fromEmail,
  fromName: providerConnections.fromName,
  id: providerConnections.id,
  name: providerConnections.name,
  provider: providerConnections.provider,
  settings: providerConnections.settings,
  signsIn: sql<boolean>`${providerConnections.credentials} is not null`,
  usesBounceAddress: providerConnections.usesBounceAddress,
};

const toConnection = (row: ConnectionRow) => {
  const basics = {
    createdAt: DateTime.fromDateUnsafe(row.createdAt),
    defaultForCampaigns: row.defaultForCampaigns,
    emailsPerMinute: row.emailsPerMinute,
    from:
      row.fromName === null
        ? { email: row.fromEmail }
        : { email: row.fromEmail, name: row.fromName },
    id: row.id,
    name: row.name,
    provider: row.provider,
  };

  return row.provider === "ses"
    ? { ...basics, ses: row.settings }
    : {
        ...basics,
        signsIn: row.signsIn,
        smtp: row.settings,
        usesBounceAddress: row.usesBounceAddress,
      };
};

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

    // WARNING: every change to which connection is the Organization's default for Campaigns, a delete included, takes this lock first, so two at once can't both find none and fail on the index's one default, nor a create miss a default being deleted.
    const lockDefaults = (organization: OrganizationId) =>
      db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, organization))
        .for("no key update");

    const sealedColumns = (
      organization: OrganizationId,
      id: string,
      target: NewCredentials
    ) =>
      Effect.gen(function* sealCredentials() {
        const json = yield* credentialsJsonOf(target);

        if (Option.isNone(json)) {
          return {
            credentials: null,
            credentialsKeyVersion: null,
          } satisfies SealedColumns;
        }

        const sealed = yield* cipher.seal(
          Redacted.make(json.value),
          sealedFor(organization, id)
        );

        return {
          credentials: sealed.value,
          credentialsKeyVersion: sealed.keyVersion,
        } satisfies SealedColumns;
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
        db
          .transaction(() =>
            Effect.gen(function* createConnection() {
              const organization = yield* currentOrganizationId;

              yield* lockDefaults(organization);

              const id = yield* newProviderConnectionId.pipe(
                Effect.provideService(SecureRandom.SecureRandom, random)
              );

              const sealed = yield* sealedColumns(organization, id, connection);

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
                  defaultForCampaigns: sql`not exists (
                select 1 from ${providerConnections}
                where ${providerConnections.organizationId} = ${organization}
                  and ${providerConnections.defaultForCampaigns}
              )`,
                  provider: connection.provider,
                  settings: yield* settingsOf(connection),
                  usesBounceAddress:
                    connection.provider === "smtp" &&
                    connection.usesBounceAddress,
                })
                .returning(connectionColumns);

              if (created === undefined) {
                return yield* Effect.die(
                  new Error("Inserting a Provider Connection returned no row")
                );
              }

              return yield* decodeConnection(toConnection(created));
            })
          )
          .pipe(Effect.orDie),

      // WARNING: the partial unique index allows one default per Organization at every moment, so the old default is cleared before the new one is set, with the Organization's defaults locked.
      makeCampaignDefault: (id) =>
        db
          .transaction(() =>
            Effect.gen(function* makeCampaignDefault() {
              const organization = yield* currentOrganizationId;

              yield* lockDefaults(organization).pipe(Effect.orDie);

              yield* db
                .update(providerConnections)
                .set({ defaultForCampaigns: false })
                .where(
                  and(
                    eq(providerConnections.organizationId, organization),
                    eq(providerConnections.defaultForCampaigns, true)
                  )
                )
                .pipe(Effect.orDie);

              const [made] = yield* db
                .update(providerConnections)
                .set({ defaultForCampaigns: true })
                .where(inOrganization(organization, id))
                .returning(connectionColumns)
                .pipe(Effect.orDie);

              if (made === undefined) {
                return yield* new ProviderConnectionNotFound();
              }

              return yield* decodeConnection(toConnection(made)).pipe(
                Effect.orDie
              );
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),

      remove: (id) =>
        db
          .transaction(() =>
            Effect.gen(function* removeConnection() {
              const organization = yield* currentOrganizationId;

              yield* lockDefaults(organization).pipe(Effect.orDie);

              const removed = yield* db
                .delete(providerConnections)
                .where(inOrganization(organization, id))
                .returning({ id: providerConnections.id })
                .pipe(Effect.orDie);

              if (removed.length === 0) {
                return yield* new ProviderConnectionNotFound();
              }
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),

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

          const settings = yield* settingsOf(changes);

          const entered = enteredCredentials(changes);

          const credentials = Option.isSome(entered)
            ? yield* sealedColumns(organization, id, entered.value)
            : {};

          const emailsPerMinute =
            changes.emailsPerMinute === "keep"
              ? {}
              : { emailsPerMinute: Option.getOrNull(changes.emailsPerMinute) };

          const bounceAddress = bounceAddressOf(changes);

          const sameServer = sql`${providerConnections.settings} = ${JSON.stringify(settings)}::jsonb`;

          // WARNING: an SMTP server with no saved sign-in has nothing to keep, so it may move anywhere; anything else keeps its credentials only for the same Provider and the same settings.
          const sameServerOrNothingToKeep =
            changes.provider === "smtp"
              ? or(isNull(providerConnections.credentials), sameServer)
              : sameServer;

          const keptOnlyForTheSameServer =
            changes.credentials === "keep"
              ? and(
                  eq(providerConnections.provider, changes.provider),
                  sameServerOrNothingToKeep
                )
              : undefined;

          const [updated] = yield* db
            .update(providerConnections)
            .set({
              ...credentials,
              ...emailsPerMinute,
              ...bounceAddress,
              fromEmail: changes.from.email,
              fromName: changes.from.name ?? null,
              name: changes.name,
              provider: changes.provider,
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

          const json =
            row.credentials === null || row.credentialsKeyVersion === null
              ? Option.none<string>()
              : Option.some(
                  Redacted.value(
                    yield* cipher
                      .open(
                        {
                          keyVersion: row.credentialsKeyVersion,
                          value: row.credentials,
                        },
                        sealedFor(organization, row.id)
                      )
                      .pipe(Effect.orDie)
                  )
                );

          if (connection.provider === "ses") {
            const credentials = yield* withoutCredentials(
              Effect.flatMap(Effect.fromOption(json), decodeSesCredentials)
            );

            return {
              connection,
              credentials,
              provider: "ses",
            } satisfies ProviderConnectionWithCredentials;
          }

          const credentials = yield* withoutCredentials(
            Option.match(json, {
              onNone: () => Effect.succeedNone,
              onSome: (opened) =>
                Effect.map(decodeSmtpCredentials(opened), Option.some),
            })
          );

          return {
            connection,
            credentials,
            provider: "smtp",
          } satisfies ProviderConnectionWithCredentials;
        }),
    };
  })
);
