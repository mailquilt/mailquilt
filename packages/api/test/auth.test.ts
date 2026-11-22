import { assert, layer } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  PASSWORD,
  send,
  sessionCookie,
  signIn,
  signUp,
  uniqueEmail,
  uniqueIp,
  verificationLinkFor,
} from "./accounts.ts";
import { betterAuthEndpoints } from "./better-auth-endpoints.ts";
import { APP_URL, AppFetch, TestApp, TRUSTED_IP_HEADER } from "./harness.ts";

const ENDPOINTS_MAILQUILT_USES = new Set([
  "POST /sign-up/email",
  "POST /sign-in/email",
  "POST /sign-out",
  "GET /get-session",
  "GET /verify-email",
  "POST /send-verification-email",
]);

const Session = Schema.NullOr(
  Schema.Struct({ user: Schema.Struct({ email: Schema.String }) })
);

const signInWithForm = (email: string, password: string, ip: string) =>
  Effect.gen(function* signInWithFormBody() {
    const fetch = yield* AppFetch;

    return yield* Effect.promise(() =>
      fetch(`${APP_URL}/api/auth/sign-in/email`, {
        body: new URLSearchParams({ email, password }),
        headers: { origin: APP_URL, [TRUSTED_IP_HEADER]: ip },
        method: "POST",
      })
    );
  });

const sessionFor = (cookie: string) =>
  Effect.gen(function* readSession() {
    const response = yield* send("GET", "/api/auth/get-session", {
      headers: { cookie },
    });

    return yield* Effect.promise(() => response.json()).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Session))
    );
  });

layer(TestApp, { timeout: "2 minutes" })("authentication", (test) => {
  test.effect(
    "returns 404 for every Better Auth endpoint Mailquilt doesn't use",
    () =>
      Effect.gen(function* outsideAllowList() {
        const unused = betterAuthEndpoints().filter(
          ({ method, path }) =>
            !ENDPOINTS_MAILQUILT_USES.has(`${method} ${path}`)
        );

        assert.isAbove(unused.length, 0);

        for (const { method, path } of unused) {
          const response = yield* send(
            method,
            `/api/auth${path.replaceAll(/:\w+/gu, "x")}`,
            method === "GET" ? {} : { body: {} }
          );

          assert.strictEqual(response.status, 404, `${method} ${path}`);
        }
      })
  );

  test.effect(
    "blocks sign-in until the email is verified through the System Mailer",
    () =>
      Effect.gen(function* verification() {
        const email = uniqueEmail();

        assert.strictEqual((yield* signUp(email)).status, 200);

        const unverified = yield* signIn(email, PASSWORD, uniqueIp());

        assert.strictEqual(unverified.status, 403);
        assert.strictEqual(sessionCookie(unverified), "");

        const link = yield* verificationLinkFor(email);

        assert.isDefined(link);
        assert.isTrue(link.startsWith(`${APP_URL}/api/auth/verify-email?`));

        const verified = yield* send("GET", link.slice(APP_URL.length));

        assert.strictEqual(verified.status, 302);

        const signedIn = yield* signIn(email, PASSWORD, uniqueIp());
        const cookie = sessionCookie(signedIn);

        assert.strictEqual(signedIn.status, 200);
        assert.strictEqual((yield* sessionFor(cookie))?.user.email, email);

        const signedOut = yield* send("POST", "/api/auth/sign-out", {
          body: {},
          headers: { cookie },
        });

        assert.strictEqual(signedOut.status, 200);
        assert.isNull(yield* sessionFor(cookie));
      })
  );

  test.effect(
    "limits sign-in to 5 a minute per IP address, ignoring a forged X-Forwarded-For",
    () =>
      Effect.gen(function* perIp() {
        const ip = uniqueIp();

        for (let attempt = 1; attempt <= 5; attempt += 1) {
          const response = yield* signIn(uniqueEmail(), "wrong password", ip, {
            "x-forwarded-for": `203.0.113.${attempt}`,
          });

          assert.strictEqual(response.status, 401);
        }

        const forged = yield* signIn(uniqueEmail(), "wrong password", ip, {
          "x-forwarded-for": "203.0.113.99",
        });

        assert.strictEqual(forged.status, 429);

        const otherClient = yield* signIn(
          uniqueEmail(),
          "wrong password",
          uniqueIp()
        );

        assert.strictEqual(otherClient.status, 401);
      })
  );

  test.effect("limits sign-in to 20 an hour per account, from any IP", () =>
    Effect.gen(function* perAccount() {
      const email = uniqueEmail();

      const allowed = yield* Effect.forEach(
        Array.from({ length: 20 }, uniqueIp),
        (ip) => signIn(email, "wrong password", ip),
        { concurrency: "unbounded" }
      );

      assert.deepStrictEqual(
        allowed.map((response) => response.status),
        Array.from({ length: 20 }, () => 401)
      );

      const limited = yield* signIn(
        email.toUpperCase(),
        "wrong password",
        uniqueIp()
      );

      const limitedForm = yield* signInWithForm(
        email,
        "wrong password",
        uniqueIp()
      );

      assert.strictEqual(limited.status, 429);
      assert.strictEqual(limitedForm.status, 429);
    })
  );

  test.effect(
    "doesn't count sign-ins the per-IP limit stopped against the account",
    () =>
      Effect.gen(function* stoppedByIp() {
        const email = uniqueEmail();
        const ip = uniqueIp();

        for (let attempt = 1; attempt <= 25; attempt += 1) {
          yield* signIn(email, "wrong password", ip);
        }

        const fromAnotherIp = yield* signIn(
          email,
          "wrong password",
          uniqueIp()
        );

        assert.strictEqual(fromAnotherIp.status, 401);
      })
  );

  test.effect(
    "refuses a sign-in body larger than 64 KiB without reading it",
    () =>
      Effect.gen(function* oversizedBody() {
        const response = yield* signIn(
          uniqueEmail(),
          "x".repeat(65 * 1024),
          uniqueIp()
        );

        assert.strictEqual(response.status, 413);
      })
  );
});
