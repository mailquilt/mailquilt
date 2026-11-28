import { assert, layer } from "@effect/vitest";
import { SmtpOutbox } from "@repo/core/testing";
import { MAX_PASSWORD_LENGTH, SIGN_UP_CLOSED } from "@repo/domain";
import { Effect, Option, Redacted, Schema } from "effect";
import { SqlClient } from "effect/sql";

import {
  clientWithCookie,
  send,
  sessionCookie,
  signedInClient,
  signIn,
  signUp,
  uniqueEmail,
  uniqueIp,
  verificationLinkFor,
} from "./accounts.ts";
import {
  ApiClient,
  APP_URL,
  BOUNCE_DOMAIN,
  InstanceAdminCookie,
  makeTestApp,
  TRUSTED_IP_HEADER,
} from "./harness.ts";

const SessionUser = Schema.Struct({
  user: Schema.Struct({ email: Schema.String, instanceAdmin: Schema.Boolean }),
});

const ErrorBody = Schema.Struct({ code: Schema.String });

const USERNAME = "system-mailer-user";

const PASSWORD = "system-mailer-password";

const FROM = { email: "accounts@example.com", name: "Example Mail" };

const SMTP = {
  host: "smtp.example.com",
  port: 587,
  security: "starttls",
} as const;

const sessionUser = (cookie: string) =>
  Effect.gen(function* readSessionUser() {
    const response = yield* send("GET", "/api/auth/get-session", {
      headers: { cookie },
    });

    return yield* Effect.promise(() => response.json()).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(SessionUser))
    );
  });

const errorCode = (response: Response) =>
  Effect.promise(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ErrorBody)),
    Effect.map((body) => body.code)
  );

const setUp = (email: string) =>
  Effect.gen(function* setUpInstance() {
    const client = yield* ApiClient;

    return yield* client.instance.setUp({
      payload: {
        email,
        name: "Ada",
        password: Redacted.make("a strong first password"),
      },
    });
  });

const adminClient = Effect.gen(function* adminClient() {
  return yield* clientWithCookie(yield* InstanceAdminCookie);
});

const sentTo = (to: string) =>
  Effect.gen(function* smtpSentTo() {
    const outbox = yield* SmtpOutbox;

    return (yield* outbox.sent).filter((sent) => sent.email.to === to);
  });

layer(makeTestApp({ install: "fresh", systemMailer: "smtp" }), {
  timeout: "2 minutes",
})("a fresh install", (test) => {
  test.effect(
    "refuses sign-up until first-run setup makes the instance admin",
    () =>
      Effect.gen(function* beforeSetup() {
        const client = yield* ApiClient;

        assert.deepStrictEqual(
          { ...(yield* client.instance.status()) },
          { bounceDomain: BOUNCE_DOMAIN, setUp: false, signUp: "invite-only" }
        );

        const refused = yield* signUp(uniqueEmail());

        assert.strictEqual(refused.status, 403);
        assert.strictEqual(yield* errorCode(refused), SIGN_UP_CLOSED);
      })
  );

  test.effect(
    "refuses a setup password longer than Better Auth signs in with",
    () =>
      Effect.gen(function* passwordTooLong() {
        const client = yield* ApiClient;

        const refused = yield* send("POST", "/api/instance/setup", {
          body: {
            email: uniqueEmail(),
            name: "Ada",
            password: "p".repeat(MAX_PASSWORD_LENGTH + 1),
          },
        });

        assert.strictEqual(refused.status, 400);
        assert.isFalse((yield* client.instance.status()).setUp);
      })
  );

  test.effect("refuses a setup email Better Auth doesn't sign in with", () =>
    Effect.gen(function* emailWithoutSignIn() {
      const client = yield* ApiClient;

      const refused = yield* send("POST", "/api/instance/setup", {
        body: {
          email: "admin@localhost",
          name: "Ada",
          password: "a strong first password",
        },
      });

      assert.strictEqual(refused.status, 400);
      assert.isFalse((yield* client.instance.status()).setUp);
    })
  );

  test.effect(
    "first-run setup makes one instance admin, who signs in with the address as typed, even when two run at once, and never runs again",
    () =>
      Effect.gen(function* firstRunSetup() {
        const client = yield* ApiClient;
        const first = `Ada.${uniqueEmail()}`;
        const second = `Ada.${uniqueEmail()}`;

        const results = yield* Effect.all(
          [first, second].map((email) =>
            setUp(email).pipe(
              Effect.as(Option.some(email)),
              Effect.catchTag("SetupClosed", () =>
                Effect.succeed(Option.none<string>())
              )
            )
          ),
          { concurrency: "unbounded" }
        );

        const admins = results.flatMap((result) =>
          Option.isSome(result) ? [result.value] : []
        );

        assert.strictEqual(admins.length, 1);

        const signedIn = yield* signIn(
          admins[0] ?? "",
          "a strong first password",
          uniqueIp()
        );

        assert.strictEqual(signedIn.status, 200);

        const { user } = yield* sessionUser(sessionCookie(signedIn));

        assert.strictEqual(user.email, admins[0]?.toLowerCase());
        assert.isTrue(user.instanceAdmin);
        assert.isTrue((yield* client.instance.status()).setUp);

        const again = yield* setUp(uniqueEmail()).pipe(Effect.flip);

        assert.strictEqual(again._tag, "SetupClosed");
      })
  );
});

layer(makeTestApp({ install: "invite-only", systemMailer: "smtp" }), {
  timeout: "2 minutes",
})("an install that was set up", (test) => {
  test.effect(
    "refuses sign-up while invite-only, and allows it while the instance admin keeps it open",
    () =>
      Effect.gen(function* signUpPolicy() {
        const admin = yield* adminClient;

        yield* admin.instance.updateSignUp({
          payload: { signUp: "invite-only" },
        });

        const refused = yield* signUp(uniqueEmail());

        assert.strictEqual(refused.status, 403);
        assert.strictEqual(yield* errorCode(refused), SIGN_UP_CLOSED);

        const opened = yield* admin.instance.updateSignUp({
          payload: { signUp: "open" },
        });

        assert.strictEqual(opened.signUp, "open");
        assert.strictEqual((yield* signUp(uniqueEmail())).status, 200);

        yield* admin.instance.updateSignUp({
          payload: { signUp: "invite-only" },
        });

        assert.strictEqual((yield* signUp(uniqueEmail())).status, 403);
      })
  );

  test.effect("lets only the instance admin see or change the settings", () =>
    Effect.gen(function* adminOnly() {
      const admin = yield* adminClient;

      yield* admin.instance.updateSignUp({ payload: { signUp: "open" } });
      yield* admin.instance.updateSystemMailer({
        payload: { from: FROM, smtp: SMTP },
      });

      const signedOut = yield* ApiClient;
      const member = yield* signedInClient;

      const settings = { payload: { from: FROM, smtp: SMTP } };

      const errors = yield* Effect.all(
        [signedOut, member].flatMap((client) => [
          client.instance.settings().pipe(Effect.flip),
          client.instance
            .updateSignUp({ payload: { signUp: "open" } })
            .pipe(Effect.flip),
          client.instance.updateSystemMailer(settings).pipe(Effect.flip),
        ])
      );

      assert.deepStrictEqual(
        errors.map((error) => error._tag),
        [
          "SignInRequired",
          "SignInRequired",
          "SignInRequired",
          "InstanceAdminRequired",
          "InstanceAdminRequired",
          "InstanceAdminRequired",
        ]
      );
    })
  );

  test.effect("never makes an instance admin through sign-up", () =>
    Effect.gen(function* notThroughSignUp() {
      const admin = yield* adminClient;

      yield* admin.instance.updateSignUp({ payload: { signUp: "open" } });
      yield* admin.instance.updateSystemMailer({
        payload: { from: FROM, smtp: SMTP },
      });

      const email = uniqueEmail();

      yield* send("POST", "/api/auth/sign-up/email", {
        body: {
          email,
          instanceAdmin: true,
          name: "Mallory",
          password: "correct horse battery staple",
        },
        headers: { [TRUSTED_IP_HEADER]: uniqueIp() },
      });

      const link = yield* verificationLinkFor(email);

      assert.isDefined(link);

      yield* send("GET", link.slice(APP_URL.length));

      const cookie = sessionCookie(
        yield* signIn(email, "correct horse battery staple", uniqueIp())
      );

      assert.isFalse((yield* sessionUser(cookie)).user.instanceAdmin);

      const error = yield* (yield* clientWithCookie(cookie)).instance
        .settings()
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "InstanceAdminRequired");
    })
  );

  test.effect(
    "sends account emails through the System Mailer saved in the settings, with its credentials sealed",
    () =>
      Effect.gen(function* savedSystemMailer() {
        const admin = yield* adminClient;
        const cookie = yield* InstanceAdminCookie;
        const sql = yield* SqlClient.SqlClient;

        yield* admin.instance.updateSignUp({ payload: { signUp: "open" } });

        const saved = yield* admin.instance.updateSystemMailer({
          payload: {
            credentials: {
              password: Redacted.make(PASSWORD),
              username: Redacted.make(USERNAME),
            },
            from: FROM,
            smtp: SMTP,
          },
        });

        assert.deepStrictEqual(
          {
            ...saved.systemMailer,
            from: { ...saved.systemMailer?.from },
            smtp: { ...saved.systemMailer?.smtp },
          },
          { from: FROM, signsIn: true, smtp: SMTP, source: "settings" }
        );

        const shown = yield* send("GET", "/api/instance/settings", {
          headers: { cookie },
        });

        const body = yield* Effect.promise(() => shown.text());

        assert.notInclude(body, USERNAME);
        assert.notInclude(body, PASSWORD);

        const [row] = yield* sql<{
          readonly credentials: string;
        }>`select system_mailer_credentials as credentials from instance`;

        assert.notInclude(
          Buffer.from(row?.credentials ?? "", "base64url").toString("latin1"),
          PASSWORD
        );

        const email = uniqueEmail();

        yield* signUp(email);

        const [verification] = yield* sentTo(email);

        assert.isDefined(verification);
        assert.deepStrictEqual({ ...verification.email.from }, FROM);
        assert.deepStrictEqual({ ...verification.settings.server }, SMTP);
        assert.deepStrictEqual(
          verification.settings.credentials.pipe(
            Option.map((credentials) => [
              Redacted.value(credentials.username),
              Redacted.value(credentials.password),
            ])
          ),
          Option.some([USERNAME, PASSWORD])
        );
      })
  );

  test.effect(
    "still answers sign-up and a new verification link when the saved System Mailer can't be read",
    () =>
      Effect.gen(function* unreadableSystemMailer() {
        const admin = yield* adminClient;
        const sql = yield* SqlClient.SqlClient;

        yield* admin.instance.updateSignUp({ payload: { signUp: "open" } });
        yield* admin.instance.updateSystemMailer({
          payload: {
            credentials: {
              password: Redacted.make(PASSWORD),
              username: Redacted.make(USERNAME),
            },
            from: FROM,
            smtp: SMTP,
          },
        });

        yield* sql`update instance set system_mailer_credentials_key_version = 99`;

        const email = uniqueEmail();

        assert.strictEqual((yield* signUp(email)).status, 200);

        const resent = yield* send(
          "POST",
          "/api/auth/send-verification-email",
          {
            body: { email },
          }
        );

        assert.strictEqual(resent.status, 200);
        assert.deepStrictEqual(yield* sentTo(email), []);

        yield* admin.instance.updateSystemMailer({
          payload: { credentials: null, from: FROM, smtp: SMTP },
        });
      })
  );

  test.effect(
    "keeps the System Mailer's saved credentials only for the server they were entered for",
    () =>
      Effect.gen(function* credentialsStayWithTheirServer() {
        const admin = yield* adminClient;

        yield* admin.instance.updateSystemMailer({
          payload: {
            credentials: {
              password: Redacted.make(PASSWORD),
              username: Redacted.make(USERNAME),
            },
            from: FROM,
            smtp: SMTP,
          },
        });

        const moved = yield* admin.instance
          .updateSystemMailer({
            payload: {
              from: FROM,
              smtp: { ...SMTP, host: "smtp.attacker.test" },
            },
          })
          .pipe(Effect.flip);

        assert.strictEqual(moved._tag, "CredentialsRequired");

        const renamed = yield* admin.instance.updateSystemMailer({
          payload: { from: { email: FROM.email }, smtp: SMTP },
        });

        assert.isTrue(renamed.systemMailer?.signsIn);
        assert.deepStrictEqual(
          { ...renamed.systemMailer?.from },
          { email: FROM.email }
        );

        const removed = yield* admin.instance.updateSystemMailer({
          payload: { credentials: null, from: FROM, smtp: SMTP },
        });

        assert.isFalse(removed.systemMailer?.signsIn);
      })
  );
});

const ENVIRONMENT_SMTP = {
  host: "smtp.environment.test",
  port: 465,
  security: "tls",
} as const;

const ENVIRONMENT_FROM = { email: "noreply@environment.test" };

layer(
  makeTestApp({
    systemMailer: "smtp",
    systemMailerConfig: Option.some({
      credentials: Option.none(),
      from: ENVIRONMENT_FROM,
      smtp: ENVIRONMENT_SMTP,
    }),
  }),
  { timeout: "2 minutes" }
)("an install with the System Mailer in environment variables", (test) => {
  test.effect(
    "sends account emails through it, shows it, and refuses to change it",
    () =>
      Effect.gen(function* systemMailerFromEnvironment() {
        const admin = yield* adminClient;

        assert.deepStrictEqual(
          (yield* admin.instance.settings()).systemMailer?.source,
          "environment"
        );

        const refused = yield* admin.instance
          .updateSystemMailer({ payload: { from: FROM, smtp: SMTP } })
          .pipe(Effect.flip);

        assert.strictEqual(refused._tag, "SystemMailerFromEnvironment");

        const email = uniqueEmail();

        yield* signUp(email);

        const [verification] = yield* sentTo(email);

        assert.isDefined(verification);
        assert.deepStrictEqual(
          { ...verification.email.from },
          ENVIRONMENT_FROM
        );
        assert.deepStrictEqual(
          { ...verification.settings.server },
          ENVIRONMENT_SMTP
        );
      })
  );
});
