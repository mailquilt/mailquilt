import { assert, layer } from "@effect/vitest";
import { TEST_EMAIL_SUBJECT } from "@repo/core";
import { SmtpOutbox } from "@repo/core/testing";
import { ProviderConnectionIdSchema, SendFailed } from "@repo/domain";
import { Array as Arr, Effect, Option, Redacted } from "effect";
import { SqlClient } from "effect/sql";

import { clientWithCookie, send, signedInPerson } from "./accounts.ts";
import { TestApp } from "./harness.ts";

const CONNECTION_ID = /^pcn_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

const NO_SUCH_CONNECTION = ProviderConnectionIdSchema.make(
  "pcn_00000000000000000000000000"
);

const USERNAME = "the smtp username";

const PASSWORD = "the smtp password";

const SMTP = {
  host: "smtp.example.com",
  port: 587,
  security: "starttls",
} as const;

const FROM = { email: "news@acme.example", name: "Acme News" };

const owner = Effect.gen(function* ownerOfOrganization() {
  const cookie = yield* signedInPerson;
  const client = yield* clientWithCookie(cookie);

  const organization = yield* client.organizations.create({
    payload: { name: "Acme" },
  });

  return { client, cookie, params: { organizationId: organization.id } };
});

const WITHOUT_CREDENTIALS = { from: FROM, name: "Postmark", smtp: SMTP };

const WITH_CREDENTIALS = {
  ...WITHOUT_CREDENTIALS,
  credentials: {
    password: Redacted.make(PASSWORD),
    username: Redacted.make(USERNAME),
  },
};

const lastSend = Effect.gen(function* lastRecordedSend() {
  const outbox = yield* SmtpOutbox;
  const sent = yield* outbox.sent;

  return Arr.isReadonlyArrayNonEmpty(sent)
    ? Arr.lastNonEmpty(sent)
    : assert.fail("Nothing was sent");
});

layer(TestApp, { timeout: "2 minutes" })("Provider Connections", (test) => {
  test.effect(
    "connects an SMTP server and lists it without its credentials",
    () =>
      Effect.gen(function* createAndList() {
        const { client, cookie, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: WITH_CREDENTIALS,
        });

        assert.match(created.id, CONNECTION_ID);
        assert.strictEqual(created.name, "Postmark");
        assert.strictEqual(created.provider, "smtp");
        assert.deepStrictEqual({ ...created.from }, FROM);
        assert.deepStrictEqual({ ...created.smtp }, SMTP);
        assert.deepStrictEqual(
          yield* client.providerConnections.list({ params }),
          [created]
        );

        const listed = yield* send(
          "GET",
          `/api/organizations/${params.organizationId}/provider-connections`,
          { headers: { cookie } }
        );

        const body = yield* Effect.promise(() => listed.text());

        assert.notInclude(body, USERNAME);
        assert.notInclude(body, PASSWORD);
        assert.notInclude(body, "credentials");
      })
  );

  test.effect("stores credentials sealed, never in plain text", () =>
    Effect.gen(function* sealedAtRest() {
      const { client, params } = yield* owner;
      const sql = yield* SqlClient.SqlClient;

      const created = yield* client.providerConnections.create({
        params,
        payload: WITH_CREDENTIALS,
      });

      const [row] = yield* sql<{
        readonly credentials: string;
        readonly credentialsKeyVersion: number;
        readonly settings: unknown;
      }>`select credentials, credentials_key_version as "credentialsKeyVersion", settings from provider_connections where id = ${created.id}`;

      assert.isDefined(row);
      assert.strictEqual(row?.credentialsKeyVersion, 1);

      const stored = Buffer.from(row?.credentials ?? "", "base64url").toString(
        "latin1"
      );

      assert.notInclude(stored, USERNAME);
      assert.notInclude(stored, PASSWORD);
      assert.notInclude(JSON.stringify(row?.settings), PASSWORD);
    })
  );

  test.effect(
    "sends a test email from the connection's sender, signing in with its credentials",
    () =>
      Effect.gen(function* testEmail() {
        const { client, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: WITH_CREDENTIALS,
        });

        const sent = yield* client.providerConnections.sendTestEmail({
          params: { ...params, providerConnectionId: created.id },
          payload: { to: "ada@example.com" },
        });

        const { email, settings } = yield* lastSend;
        const credentials = Option.getOrThrow(settings.credentials);

        assert.match(sent.messageId, /^<\d+@smtp\.test>$/u);
        assert.deepStrictEqual({ ...settings.server }, SMTP);
        assert.strictEqual(Redacted.value(credentials.username), USERNAME);
        assert.strictEqual(Redacted.value(credentials.password), PASSWORD);
        assert.deepStrictEqual({ ...email.from }, FROM);
        assert.strictEqual(email.to, "ada@example.com");
        assert.strictEqual(email.subject, TEST_EMAIL_SUBJECT);
        assert.include(email.text, "Postmark");
      })
  );

  test.effect(
    "sends without signing in when the server needs no credentials",
    () =>
      Effect.gen(function* noCredentials() {
        const { client, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: WITHOUT_CREDENTIALS,
        });

        yield* client.providerConnections.sendTestEmail({
          params: { ...params, providerConnectionId: created.id },
          payload: { to: "ada@example.com" },
        });

        assert.isTrue(Option.isNone((yield* lastSend).settings.credentials));
      })
  );

  test.effect(
    "answers a connection it doesn't have with ProviderConnectionNotFound",
    () =>
      Effect.gen(function* missingConnection() {
        const { client, params } = yield* owner;

        const error = yield* client.providerConnections
          .sendTestEmail({
            params: { ...params, providerConnectionId: NO_SUCH_CONNECTION },
            payload: { to: "ada@example.com" },
          })
          .pipe(Effect.flip);

        assert.strictEqual(error._tag, "ProviderConnectionNotFound");
      })
  );

  test.effect("says why the Provider refused a test email", () =>
    Effect.gen(function* refused() {
      const { client, params } = yield* owner;
      const outbox = yield* SmtpOutbox;

      const created = yield* client.providerConnections.create({
        params,
        payload: WITH_CREDENTIALS,
      });

      yield* outbox.failNextSend(
        new SendFailed({
          detail: "535 5.7.8 Authentication credentials invalid",
          reason: "auth",
        })
      );

      const error = yield* client.providerConnections
        .sendTestEmail({
          params: { ...params, providerConnectionId: created.id },
          payload: { to: "ada@example.com" },
        })
        .pipe(Effect.flip);

      assert.deepStrictEqual(
        error,
        new SendFailed({
          detail: "535 5.7.8 Authentication credentials invalid",
          reason: "auth",
        })
      );
    })
  );
});
