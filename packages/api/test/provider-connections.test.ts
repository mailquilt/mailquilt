import { assert, layer } from "@effect/vitest";
import { SesOutbox, SmtpOutbox } from "@repo/core/testing";
import type { ProviderConnection } from "@repo/domain";
import {
  ProviderConnectionIdSchema,
  SendFailed,
  TEST_EMAIL_SUBJECT,
} from "@repo/domain";
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

const smtpOf = (connection: ProviderConnection) =>
  connection.provider === "smtp"
    ? connection
    : assert.fail("Not an SMTP connection");

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

const ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";

const SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

const SES = {
  credentials: {
    accessKeyId: Redacted.make(ACCESS_KEY_ID),
    secretAccessKey: Redacted.make(SECRET_ACCESS_KEY),
  },
  from: FROM,
  name: "SES",
  provider: "ses",
  ses: { region: "eu-west-1" },
} as const;

const lastSesSend = Effect.gen(function* lastRecordedSesSend() {
  const outbox = yield* SesOutbox;
  const sent = yield* outbox.sent;

  return Arr.isReadonlyArrayNonEmpty(sent)
    ? Arr.lastNonEmpty(sent)
    : assert.fail("Nothing was sent through SES");
});

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
        assert.deepStrictEqual({ ...smtpOf(created).smtp }, SMTP);
        assert.isTrue(smtpOf(created).signsIn);
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

  test.effect(
    "edits a connection and keeps its credentials when they're left out",
    () =>
      Effect.gen(function* editKeepingCredentials() {
        const { client, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: WITH_CREDENTIALS,
        });

        const connectionParams = {
          ...params,
          providerConnectionId: created.id,
        };

        const edited = yield* client.providerConnections.update({
          params: connectionParams,
          payload: {
            ...WITHOUT_CREDENTIALS,
            from: { email: "hello@acme.example" },
            name: "Postmark (broadcasts)",
          },
        });

        yield* client.providerConnections.sendTestEmail({
          params: connectionParams,
          payload: { to: "ada@example.com" },
        });

        const { email, settings } = yield* lastSend;
        const credentials = Option.getOrThrow(settings.credentials);

        assert.strictEqual(edited.name, "Postmark (broadcasts)");
        assert.deepStrictEqual(
          { ...edited.from },
          { email: "hello@acme.example" }
        );
        assert.deepStrictEqual(
          yield* client.providerConnections.list({ params }),
          [edited]
        );
        assert.strictEqual(Redacted.value(credentials.password), PASSWORD);
        assert.strictEqual(email.from.email, "hello@acme.example");
      })
  );

  test.effect("replaces credentials, or removes them with null", () =>
    Effect.gen(function* replaceCredentials() {
      const { client, params } = yield* owner;

      const created = yield* client.providerConnections.create({
        params,
        payload: WITH_CREDENTIALS,
      });

      const connectionParams = { ...params, providerConnectionId: created.id };

      const testEmail = client.providerConnections.sendTestEmail({
        params: connectionParams,
        payload: { to: "ada@example.com" },
      });

      yield* client.providerConnections.update({
        params: connectionParams,
        payload: {
          ...WITHOUT_CREDENTIALS,
          credentials: {
            password: Redacted.make("the new smtp password"),
            username: Redacted.make(USERNAME),
          },
        },
      });
      yield* testEmail;

      const replaced = Option.getOrThrow(
        (yield* lastSend).settings.credentials
      );

      const withoutSignIn = yield* client.providerConnections.update({
        params: connectionParams,
        payload: { ...WITHOUT_CREDENTIALS, credentials: null },
      });

      yield* testEmail;

      assert.isFalse(smtpOf(withoutSignIn).signsIn);

      assert.strictEqual(
        Redacted.value(replaced.password),
        "the new smtp password"
      );
      assert.isTrue(Option.isNone((yield* lastSend).settings.credentials));
    })
  );

  test.effect(
    "needs credentials entered again before they go to another server",
    () =>
      Effect.gen(function* credentialsFollowTheServer() {
        const { client, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: WITH_CREDENTIALS,
        });

        const connectionParams = {
          ...params,
          providerConnectionId: created.id,
        };

        const errors = yield* Effect.forEach(
          [
            { ...SMTP, host: "smtp.attacker.example" },
            { ...SMTP, port: 2525 },
            { ...SMTP, security: "none" as const },
          ],
          (smtp) =>
            client.providerConnections
              .update({
                params: connectionParams,
                payload: { ...WITHOUT_CREDENTIALS, smtp },
              })
              .pipe(Effect.flip)
        );

        assert.deepStrictEqual(
          errors.map((error) => error._tag),
          ["CredentialsRequired", "CredentialsRequired", "CredentialsRequired"]
        );
        assert.deepStrictEqual(
          yield* client.providerConnections.list({ params }),
          [created]
        );
      })
  );

  test.effect(
    "moves a connection with no saved sign-in to another server",
    () =>
      Effect.gen(function* noCredentialsToProtect() {
        const { client, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: WITHOUT_CREDENTIALS,
        });

        const moved = yield* client.providerConnections.update({
          params: { ...params, providerConnectionId: created.id },
          payload: {
            ...WITHOUT_CREDENTIALS,
            smtp: { ...SMTP, host: "relay.acme.example" },
          },
        });

        assert.strictEqual(smtpOf(moved).smtp.host, "relay.acme.example");
        assert.isFalse(smtpOf(moved).signsIn);
      })
  );

  test.effect(
    "sets a sending rate, keeps it when an edit leaves it out, and clears it with null",
    () =>
      Effect.gen(function* sendingRate() {
        const { client, params } = yield* owner;

        const unset = yield* client.providerConnections.create({
          params,
          payload: WITHOUT_CREDENTIALS,
        });

        const created = yield* client.providerConnections.create({
          params,
          payload: { ...WITHOUT_CREDENTIALS, emailsPerMinute: 30 },
        });

        const connectionParams = {
          ...params,
          providerConnectionId: created.id,
        };

        const kept = yield* client.providerConnections.update({
          params: connectionParams,
          payload: { ...WITHOUT_CREDENTIALS, name: "Postmark (slow)" },
        });

        const cleared = yield* client.providerConnections.update({
          params: connectionParams,
          payload: { ...WITHOUT_CREDENTIALS, emailsPerMinute: null },
        });

        assert.isNull(unset.emailsPerMinute);
        assert.strictEqual(created.emailsPerMinute, 30);
        assert.strictEqual(kept.emailsPerMinute, 30);
        assert.isNull(cleared.emailsPerMinute);
      })
  );

  test.effect(
    "refuses a sending rate that isn't a whole number from 10 to 60,000 a minute",
    () =>
      Effect.gen(function* sendingRateLimits() {
        const { cookie, params } = yield* owner;

        const statuses = yield* Effect.forEach(
          [9, 60_001, 12.5, 10, 60_000],
          (emailsPerMinute) =>
            send(
              "POST",
              `/api/organizations/${params.organizationId}/provider-connections`,
              {
                body: { ...WITHOUT_CREDENTIALS, emailsPerMinute },
                headers: { cookie },
              }
            ).pipe(Effect.map((response) => response.status))
        );

        assert.deepStrictEqual(statuses, [400, 400, 400, 201, 201]);
      })
  );

  test.effect(
    "connects an SES account and lists it without its access key",
    () =>
      Effect.gen(function* createSes() {
        const { client, cookie, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: SES,
        });

        const listed = yield* send(
          "GET",
          `/api/organizations/${params.organizationId}/provider-connections`,
          { headers: { cookie } }
        );

        const body = yield* Effect.promise(() => listed.text());

        assert.strictEqual(created.provider, "ses");
        assert.deepStrictEqual(
          created.provider === "ses" ? { ...created.ses } : undefined,
          { region: "eu-west-1" }
        );
        assert.isNull(created.emailsPerMinute);
        assert.deepStrictEqual(
          yield* client.providerConnections.list({ params }),
          [created]
        );
        assert.notInclude(body, ACCESS_KEY_ID);
        assert.notInclude(body, SECRET_ACCESS_KEY);
      })
  );

  test.effect(
    "sends a test email through the SES account with its access key",
    () =>
      Effect.gen(function* sesTestEmail() {
        const { client, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: SES,
        });

        const sent = yield* client.providerConnections.sendTestEmail({
          params: { ...params, providerConnectionId: created.id },
          payload: { to: "ada@example.com" },
        });

        const { email, settings } = yield* lastSesSend;

        assert.strictEqual(sent.messageId, "ses-1");
        assert.strictEqual(email.to, "ada@example.com");
        assert.strictEqual(email.subject, TEST_EMAIL_SUBJECT);
        assert.include(email.text, "(Amazon SES, eu-west-1)");
        assert.deepStrictEqual(
          { ...settings.account },
          { region: "eu-west-1" }
        );
        assert.strictEqual(
          Redacted.value(settings.credentials.accessKeyId),
          ACCESS_KEY_ID
        );
        assert.strictEqual(
          Redacted.value(settings.credentials.secretAccessKey),
          SECRET_ACCESS_KEY
        );
      })
  );

  test.effect(
    "keeps an SES access key for the same Region, and needs it entered again for another Region or Provider",
    () =>
      Effect.gen(function* sesKeyFollowsTheAccount() {
        const { client, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: SES,
        });

        const noSignIn = yield* client.providerConnections.create({
          params,
          payload: WITHOUT_CREDENTIALS,
        });

        const { credentials: _entered, ...withoutKey } = SES;

        const connectionParams = {
          ...params,
          providerConnectionId: created.id,
        };

        const renamed = yield* client.providerConnections.update({
          params: connectionParams,
          payload: { ...withoutKey, name: "SES (Ireland)" },
        });

        const errors = yield* Effect.forEach(
          [
            {
              id: created.id,
              payload: { ...withoutKey, ses: { region: "us-east-1" } },
            },
            { id: created.id, payload: WITHOUT_CREDENTIALS },
            { id: noSignIn.id, payload: withoutKey },
          ],
          ({ id, payload }) =>
            client.providerConnections
              .update({
                params: { ...params, providerConnectionId: id },
                payload,
              })
              .pipe(Effect.flip)
        );

        assert.strictEqual(renamed.name, "SES (Ireland)");
        assert.deepStrictEqual(
          errors.map((error) => error._tag),
          ["CredentialsRequired", "CredentialsRequired", "CredentialsRequired"]
        );
        assert.deepStrictEqual(
          yield* client.providerConnections.list({ params }),
          [renamed, noSignIn]
        );
      })
  );

  test.effect(
    "moves a connection from SMTP to SES with the account's access key",
    () =>
      Effect.gen(function* smtpToSes() {
        const { client, params } = yield* owner;

        const created = yield* client.providerConnections.create({
          params,
          payload: WITH_CREDENTIALS,
        });

        const connectionParams = {
          ...params,
          providerConnectionId: created.id,
        };

        const moved = yield* client.providerConnections.update({
          params: connectionParams,
          payload: SES,
        });

        yield* client.providerConnections.sendTestEmail({
          params: connectionParams,
          payload: { to: "ada@example.com" },
        });

        const { settings } = yield* lastSesSend;

        assert.strictEqual(moved.provider, "ses");
        assert.strictEqual(
          Redacted.value(settings.credentials.accessKeyId),
          ACCESS_KEY_ID
        );
      })
  );

  test.effect(
    "refuses an SES account without an access key, or with a Region that isn't one",
    () =>
      Effect.gen(function* sesRefused() {
        const { cookie, params } = yield* owner;
        const { credentials: _entered, ...withoutKey } = SES;

        const sesPayload = {
          ...SES,
          credentials: {
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
          },
        };

        const statuses = yield* Effect.forEach(
          [
            withoutKey,
            { ...sesPayload, ses: { region: "attacker.example/" } },
            { ...sesPayload, ses: { region: "eu-west-1" } },
          ],
          (body) =>
            send(
              "POST",
              `/api/organizations/${params.organizationId}/provider-connections`,
              { body, headers: { cookie } }
            ).pipe(Effect.map((response) => response.status))
        );

        assert.deepStrictEqual(statuses, [400, 400, 201]);
      })
  );

  test.effect(
    "makes one connection the Organization's default for Campaigns, moving it from any other",
    () =>
      Effect.gen(function* campaignDefault() {
        const { client, params } = yield* owner;

        const smtp = yield* client.providerConnections.create({
          params,
          payload: WITHOUT_CREDENTIALS,
        });

        const ses = yield* client.providerConnections.create({
          params,
          payload: SES,
        });

        const madeDefault =
          yield* client.providerConnections.makeCampaignDefault({
            params: { ...params, providerConnectionId: smtp.id },
          });

        yield* client.providerConnections.makeCampaignDefault({
          params: { ...params, providerConnectionId: ses.id },
        });

        const listed = yield* client.providerConnections.list({ params });

        const missing = yield* client.providerConnections
          .makeCampaignDefault({
            params: { ...params, providerConnectionId: NO_SUCH_CONNECTION },
          })
          .pipe(Effect.flip);

        assert.isTrue(madeDefault.defaultForCampaigns);
        assert.deepStrictEqual(
          listed.map((connection) => [
            connection.name,
            connection.defaultForCampaigns,
          ]),
          [
            ["Postmark", false],
            ["SES", true],
          ]
        );
        assert.strictEqual(missing._tag, "ProviderConnectionNotFound");
      })
  );

  test.effect(
    "makes a connection the default for Campaigns when the Organization has none, and only then",
    () =>
      Effect.gen(function* firstIsDefault() {
        const { client, params } = yield* owner;

        const first = yield* client.providerConnections.create({
          params,
          payload: WITHOUT_CREDENTIALS,
        });

        const second = yield* client.providerConnections.create({
          params,
          payload: SES,
        });

        yield* client.providerConnections.delete({
          params: { ...params, providerConnectionId: first.id },
        });

        const afterDefaultDeleted = yield* client.providerConnections.create({
          params,
          payload: { ...WITHOUT_CREDENTIALS, name: "Relay" },
        });

        assert.isTrue(first.defaultForCampaigns);
        assert.isFalse(second.defaultForCampaigns);
        assert.isTrue(afterDefaultDeleted.defaultForCampaigns);
      })
  );

  test.effect("deletes a connection", () =>
    Effect.gen(function* deleteConnection() {
      const { client, params } = yield* owner;

      const created = yield* client.providerConnections.create({
        params,
        payload: WITH_CREDENTIALS,
      });

      const connectionParams = { ...params, providerConnectionId: created.id };

      yield* client.providerConnections.delete({ params: connectionParams });

      const again = yield* client.providerConnections
        .delete({ params: connectionParams })
        .pipe(Effect.flip);

      assert.deepStrictEqual(
        yield* client.providerConnections.list({ params }),
        []
      );
      assert.strictEqual(again._tag, "ProviderConnectionNotFound");
    })
  );

  test.effect("allows each person 10 test emails every 10 minutes", () =>
    Effect.gen(function* testEmailLimit() {
      const { client, params } = yield* owner;

      const created = yield* client.providerConnections.create({
        params,
        payload: WITH_CREDENTIALS,
      });

      const testEmail = client.providerConnections.sendTestEmail({
        params: { ...params, providerConnectionId: created.id },
        payload: { to: "ada@example.com" },
      });

      yield* Effect.replicateEffect(testEmail, 10);

      const error = yield* testEmail.pipe(Effect.flip);

      assert.strictEqual(error._tag, "RateLimited");
    })
  );
});
