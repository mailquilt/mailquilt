import type { SystemMailer } from "@repo/core";
import { RateLimiter, sendEmailVerification } from "@repo/core";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { Duration, Effect, Option, Redacted, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { AUTH_BASE_PATH, DISABLED_AUTH_PATHS } from "./allow-list.ts";
import { AuthConfig } from "./config.ts";
import { kyselyOnSqlClient } from "./kysely.ts";

/**
 * The only header Better Auth reads the client IP from. Our router sets it
 * on every request it forwards, replacing any value the client sent.
 */
export const CLIENT_IP_HEADER = "x-mailquilt-client-ip";

const SIGN_IN_PER_IP = { max: 5, window: 60 };

const SIGN_IN_PER_ACCOUNT_ANY_IP = { max: 20, window: Duration.hours(1) };

const SignInBody = Schema.Struct({ email: Schema.String });

const sha256Hex = (text: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  ).pipe(
    Effect.map((digest) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("")
    )
  );

const consumeSignInForAccount = (email: string) =>
  Effect.gen(function* consumeSignInForAccountHash() {
    const rateLimiter = yield* RateLimiter;
    const account = yield* sha256Hex(email.trim().toLowerCase());

    return yield* rateLimiter.consume(
      `sign-in-account:${account}`,
      SIGN_IN_PER_ACCOUNT_ANY_IP
    );
  });

const retryAfterSeconds = (retryAfter: Duration.Duration) =>
  Math.ceil(Duration.toSeconds(retryAfter));

/**
 * Better Auth for one request, on that request's ports. Building it is cheap:
 * Better Auth builds its router for every request anyway.
 */
export const makeAuth = Effect.gen(function* makeAuth() {
  const config = yield* AuthConfig;
  const sql = yield* SqlClient.SqlClient;
  const rateLimiter = yield* RateLimiter;

  const runPromise = Effect.runPromiseWith(
    yield* Effect.context<RateLimiter | SystemMailer>()
  );

  return betterAuth({
    account: { modelName: "accounts" },
    advanced: {
      cookiePrefix: "mailquilt",
      database: { validateSchema: false },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      useSecureCookies: true,
    },
    appName: "Mailquilt",
    baseURL: config.appUrl,
    basePath: AUTH_BASE_PATH,
    database: {
      db: kyselyOnSqlClient(sql, runPromise),
      transaction: true,
      type: "postgres",
    },
    disabledPaths: DISABLED_AUTH_PATHS,
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const signIn = Schema.decodeUnknownOption(SignInBody)(ctx.body);

        if (ctx.path !== "/sign-in/email" || Option.isNone(signIn)) {
          return;
        }

        const decision = await runPromise(
          consumeSignInForAccount(signIn.value.email)
        );

        if (!decision.allowed) {
          throw new APIError(
            "TOO_MANY_REQUESTS",
            { message: "Too many requests. Please try again later." },
            { "X-Retry-After": String(retryAfterSeconds(decision.retryAfter)) }
          );
        }
      }),
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }) =>
        runPromise(sendEmailVerification(user.email, url)),
    },
    // WARNING: Better Auth logs email addresses below error level, and our logs must never hold them.
    logger: { level: "error" },
    rateLimit: {
      customRules: { "/sign-in/email": SIGN_IN_PER_IP },
      customStorage: {
        consume: (key, rule) =>
          runPromise(
            rateLimiter.consume(key, {
              max: rule.max,
              window: Duration.seconds(rule.window),
            })
          ).then((decision) =>
            decision.allowed
              ? { allowed: true, retryAfter: null }
              : {
                  allowed: false,
                  retryAfter: retryAfterSeconds(decision.retryAfter),
                }
          ),
      },
      enabled: true,
    },
    secret: Redacted.value(config.secret),
    session: { modelName: "sessions" },
    telemetry: { enabled: false },
    trustedOrigins: [new URL(config.appUrl).origin],
    user: { modelName: "users" },
    verification: { modelName: "verifications" },
  });
});
