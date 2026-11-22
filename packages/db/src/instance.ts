import { CredentialCipher, Instance } from "@repo/core";
import type { SystemMailerChanges } from "@repo/core";
import {
  InstanceStatus,
  Sender,
  SetupClosed,
  SignUpPolicySchema,
  SmtpCredentials,
  SmtpServer,
  CredentialsRequired,
} from "@repo/domain";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { Effect, Layer, Option, Redacted, Schema } from "effect";
import { SecureRandom } from "effect/crypto";
import { Base64Url } from "effect/encoding";

import { Database } from "./database.ts";
import { accounts, instance, users } from "./schema.ts";

const SIGN_UP_BEFORE_SETUP = "invite-only";

const SEALED_FOR = "instance:system_mailer";

const BETTER_AUTH_ID_BYTES = 24;

const decodeSignUp = Schema.decodeUnknownEffect(SignUpPolicySchema);

const decodeSender = Schema.decodeUnknownEffect(Sender);

const decodeServer = Schema.decodeUnknownEffect(SmtpServer);

const encodeServer = Schema.encodeEffect(SmtpServer);

const CredentialsJson = Schema.fromJsonString(SmtpCredentials);

const encodeCredentials = Schema.encodeEffect(CredentialsJson);

const decodeCredentials = Schema.decodeEffect(CredentialsJson);

// WARNING: a Schema error quotes the value it failed on, here the credentials; replace it before it can reach a log.
const withoutCredentials = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError(
      () => new Error("System Mailer credentials didn't convert")
    ),
    Effect.orDie
  );

const mailerColumns = {
  fromEmail: instance.systemMailerFromEmail,
  fromName: instance.systemMailerFromName,
  smtp: instance.systemMailerSmtp,
};

interface MailerRow {
  readonly fromEmail: string | null;
  readonly fromName: string | null;
  readonly smtp: unknown;
}

const savedMailer = (row: MailerRow | undefined) =>
  Effect.gen(function* savedSystemMailer() {
    if (row?.fromEmail === null || row?.fromEmail === undefined) {
      return Option.none();
    }

    return Option.some({
      from: yield* decodeSender(
        row.fromName === null
          ? { email: row.fromEmail }
          : { email: row.fromEmail, name: row.fromName }
      ),
      smtp: yield* decodeServer(row.smtp),
    });
  });

/**
 * The install in Postgres: its one `instance` row and who its instance admin
 * is. First-run setup writes the row, the admin and their password in one
 * transaction. The System Mailer's credentials are sealed before they are
 * written and opened only by `systemMailerWithCredentials`. A failed query is
 * a defect.
 */
export const InstanceLive = Layer.effect(
  Instance,
  Effect.gen(function* instanceRepository() {
    const db = yield* Database;
    const cipher = yield* CredentialCipher;
    const random = yield* SecureRandom.SecureRandom;

    const newId = random
      .randomBytes(BETTER_AUTH_ID_BYTES)
      .pipe(Effect.map((bytes) => Base64Url.encode(bytes)));

    const sealedColumns = (
      credentials: Option.Option<typeof SmtpCredentials.Type>
    ) =>
      Option.match(credentials, {
        onNone: () =>
          Effect.succeed({
            systemMailerCredentials: null,
            systemMailerCredentialsKeyVersion: null,
          }),
        onSome: (opened) =>
          withoutCredentials(encodeCredentials(opened)).pipe(
            Effect.flatMap((json) =>
              cipher.seal(Redacted.make(json), SEALED_FOR)
            ),
            Effect.map((sealed) => ({
              systemMailerCredentials: sealed.value,
              systemMailerCredentialsKeyVersion: sealed.keyVersion,
            }))
          ),
      });

    const saveSystemMailer = (changes: SystemMailerChanges) =>
      Effect.gen(function* saveMailer() {
        const smtp = yield* encodeServer(changes.smtp).pipe(Effect.orDie);

        const credentials =
          changes.credentials === "keep"
            ? {}
            : yield* sealedColumns(changes.credentials);

        const keptOnlyForTheSameServer =
          changes.credentials === "keep"
            ? or(
                isNull(instance.systemMailerCredentials),
                sql`${instance.systemMailerSmtp} = ${JSON.stringify(smtp)}::jsonb`
              )
            : undefined;

        const saved = yield* db
          .update(instance)
          .set({
            ...credentials,
            systemMailerFromEmail: changes.from.email,
            systemMailerFromName: changes.from.name ?? null,
            systemMailerSmtp: smtp,
            updatedAt: sql`now()`,
          })
          .where(and(eq(instance.id, true), keptOnlyForTheSameServer))
          .returning({ id: instance.id })
          .pipe(Effect.orDie);

        if (saved.length === 0) {
          return yield* new CredentialsRequired();
        }
      });

    return {
      isAdmin: (user) =>
        db
          .select({ instanceAdmin: users.instanceAdmin })
          .from(users)
          .where(eq(users.id, user))
          .pipe(
            Effect.map(([row]) => row?.instanceAdmin === true),
            Effect.orDie
          ),

      saveSystemMailer,

      setSignUp: (policy) =>
        db
          .update(instance)
          .set({ signUp: policy, updatedAt: sql`now()` })
          .where(eq(instance.id, true))
          .pipe(Effect.asVoid, Effect.orDie),

      setUp: (admin) =>
        db
          .transaction((tx) =>
            Effect.gen(function* setUpWithAdmin() {
              const claimed = yield* tx
                .insert(instance)
                .values({})
                .onConflictDoNothing()
                .returning({ id: instance.id });

              if (claimed.length === 0) {
                return yield* new SetupClosed();
              }

              const userId = yield* newId;

              yield* tx.insert(users).values({
                email: admin.email,
                emailVerified: true,
                id: userId,
                instanceAdmin: true,
                name: admin.name,
              });

              yield* tx.insert(accounts).values({
                accountId: userId,
                id: yield* newId,
                password: admin.passwordHash,
                providerId: "credential",
                userId,
              });
            })
          )
          .pipe(
            Effect.catchTag(
              ["SqlError", "EffectDrizzleQueryError"],
              Effect.die
            ),
            Effect.asVoid
          ),

      status: Effect.gen(function* instanceStatus() {
        const [row] = yield* db
          .select({ signUp: instance.signUp })
          .from(instance);

        return new InstanceStatus({
          setUp: row !== undefined,
          signUp: yield* decodeSignUp(row?.signUp ?? SIGN_UP_BEFORE_SETUP),
        });
      }).pipe(Effect.orDie),

      systemMailer: Effect.gen(function* systemMailer() {
        const [row] = yield* db
          .select({
            ...mailerColumns,
            signsIn: sql<boolean>`${instance.systemMailerCredentials} is not null`,
          })
          .from(instance);

        return (yield* savedMailer(row)).pipe(
          Option.map((mailer) => ({
            ...mailer,
            signsIn: row?.signsIn === true,
          }))
        );
      }).pipe(Effect.orDie),

      systemMailerWithCredentials: Effect.gen(
        function* systemMailerWithCredentials() {
          const [row] = yield* db
            .select({
              ...mailerColumns,
              credentials: instance.systemMailerCredentials,
              credentialsKeyVersion: instance.systemMailerCredentialsKeyVersion,
            })
            .from(instance)
            .pipe(Effect.orDie);

          const saved = yield* savedMailer(row).pipe(Effect.orDie);

          if (Option.isNone(saved)) {
            return Option.none();
          }

          if (
            row?.credentials === null ||
            row?.credentials === undefined ||
            row.credentialsKeyVersion === null
          ) {
            return Option.some({ ...saved.value, credentials: Option.none() });
          }

          const json = yield* cipher
            .open(
              { keyVersion: row.credentialsKeyVersion, value: row.credentials },
              SEALED_FOR
            )
            .pipe(Effect.orDie);

          const credentials = yield* withoutCredentials(
            decodeCredentials(Redacted.value(json))
          );

          return Option.some({
            ...saved.value,
            credentials: Option.some(credentials),
          });
        }
      ),
    };
  })
);
