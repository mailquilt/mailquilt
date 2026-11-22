import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit, Layer, Option, Redacted } from "effect";

import {
  SystemMailerConfig,
  SystemMailerConfigFromEnv,
} from "./system-mailer-config.ts";

const COMPLETE = {
  SYSTEM_MAILER_FROM_EMAIL: "accounts@example.com",
  SYSTEM_MAILER_FROM_NAME: "Example",
  SYSTEM_MAILER_SMTP_HOST: "smtp.example.com",
  SYSTEM_MAILER_SMTP_PASSWORD: "secret-password",
  SYSTEM_MAILER_SMTP_PORT: "587",
  SYSTEM_MAILER_SMTP_SECURITY: "starttls",
  SYSTEM_MAILER_SMTP_USERNAME: "user",
};

const readFrom = (env: Record<string, string>) =>
  Effect.gen(function* readSystemMailerConfig() {
    return yield* SystemMailerConfig;
  }).pipe(
    Effect.provide(
      SystemMailerConfigFromEnv.pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))
      )
    )
  );

const withoutKey = (key: keyof typeof COMPLETE) =>
  Object.fromEntries(Object.entries(COMPLETE).filter(([name]) => name !== key));

describe("System Mailer from environment variables", () => {
  it.effect("is none when no SYSTEM_MAILER_ variable is set", () =>
    Effect.gen(function* none() {
      assert.isTrue(Option.isNone(yield* readFrom({ PORT: "3000" })));
    })
  );

  it.effect("reads the server, sender and credentials", () =>
    Effect.gen(function* complete() {
      const config = yield* readFrom(COMPLETE);

      assert.isTrue(Option.isSome(config));

      if (Option.isNone(config)) {
        return;
      }

      assert.deepStrictEqual(config.value.from, {
        email: "accounts@example.com",
        name: "Example",
      });
      assert.deepStrictEqual(config.value.smtp, {
        host: "smtp.example.com",
        port: 587,
        security: "starttls",
      });
      assert.deepStrictEqual(
        config.value.credentials.pipe(
          Option.map((credentials) => [
            Redacted.value(credentials.username),
            Redacted.value(credentials.password),
          ])
        ),
        Option.some(["user", "secret-password"])
      );
    })
  );

  it.effect("sends from the address alone when the from name is blank", () =>
    Effect.gen(function* blankName() {
      const config = yield* readFrom({
        ...COMPLETE,
        SYSTEM_MAILER_FROM_NAME: "   ",
      });

      assert.deepStrictEqual(
        config.pipe(Option.map((mailer) => mailer.from)),
        Option.some({ email: "accounts@example.com" })
      );
    })
  );

  it.effect("stops the app when a variable it needs is missing", () =>
    Effect.gen(function* missing() {
      const exit = yield* readFrom(withoutKey("SYSTEM_MAILER_SMTP_PORT")).pipe(
        Effect.exit
      );

      assert.isTrue(Exit.hasDies(exit));
    })
  );

  it.effect("stops the app when only one of username and password is set", () =>
    Effect.gen(function* halfCredentials() {
      const exit = yield* readFrom(
        withoutKey("SYSTEM_MAILER_SMTP_PASSWORD")
      ).pipe(Effect.exit);

      assert.isTrue(Exit.hasDies(exit));
    })
  );

  it.effect(
    "stops the app on a value that fails its check, without quoting a credential",
    () =>
      Effect.gen(function* invalid() {
        const exit = yield* readFrom({
          ...COMPLETE,
          SYSTEM_MAILER_SMTP_PASSWORD: "p".repeat(1001),
        }).pipe(Effect.exit);

        assert.isTrue(Exit.hasDies(exit));
        assert.notInclude(String(exit), "p".repeat(1001));
      })
  );
});
