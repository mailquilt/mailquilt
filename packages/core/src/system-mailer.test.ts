import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Layer, Ref } from "effect";

import { SystemMailer, SystemMailerAfterResponding } from "./system-mailer.ts";
import type { SystemEmail } from "./system-mailer.ts";

const EMAIL: SystemEmail = {
  subject: "Verify your email address for Mailquilt",
  text: "Open this link",
  to: "person@example.com",
};

describe("System Mailer after responding", () => {
  it.effect("answers before the email is sent, and sends it afterwards", () =>
    Effect.gen(function* afterResponding() {
      const serverAnswers = yield* Deferred.make<undefined>();
      const delivered = yield* Deferred.make<SystemEmail>();
      const sent = yield* Ref.make<readonly SystemEmail[]>([]);

      const slowServer = Layer.succeed(SystemMailer, {
        send: (email) =>
          Deferred.await(serverAnswers).pipe(
            Effect.andThen(Ref.update(sent, (emails) => [...emails, email])),
            Effect.andThen(Deferred.succeed(delivered, email)),
            Effect.asVoid
          ),
      });

      const mailer = yield* SystemMailer.pipe(
        Effect.provide(
          SystemMailerAfterResponding.pipe(Layer.provide(slowServer))
        )
      );

      yield* mailer.send(EMAIL);

      assert.deepStrictEqual(yield* Ref.get(sent), []);

      yield* Deferred.succeed(serverAnswers, undefined);

      assert.deepStrictEqual(yield* Deferred.await(delivered), EMAIL);
    })
  );
});
