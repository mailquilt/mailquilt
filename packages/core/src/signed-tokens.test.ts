import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Exit, Redacted } from "effect";
import { Base64 } from "effect/encoding";
import { TestClock } from "effect/testing";

import { SignedTokens, signedTokensLayer } from "./signed-tokens.ts";

const KEY_1 = `1:${Base64.encode(new Uint8Array(32).fill(1))}`;

const KEY_2 = `2:${Base64.encode(new Uint8Array(32).fill(2))}`;

const PAYLOAD = "org_01h455vb4pex5vsknk084sn02q.cnt_01h455vb4pex5vsknk084sn02q";

const tokensWith = (keys: string) => signedTokensLayer(Redacted.make(keys));

const sign = (options?: { readonly expiresAt?: DateTime.Utc }) =>
  Effect.gen(function* signPayload() {
    const tokens = yield* SignedTokens;

    return yield* tokens.sign("unsubscribe", PAYLOAD, options);
  });

const verify = (token: string) =>
  Effect.gen(function* verifyToken() {
    const tokens = yield* SignedTokens;

    return yield* tokens.verify("unsubscribe", token).pipe(Effect.exit);
  });

const swapCharacter = (text: string, index: number) =>
  `${text.slice(0, index)}${text[index] === "A" ? "B" : "A"}${text.slice(index + 1)}`;

describe("signed tokens", () => {
  it.effect("gives back the payload a token was signed with", () =>
    Effect.gen(function* roundTrip() {
      const token = yield* sign();

      assert.deepStrictEqual(yield* verify(token), Exit.succeed(PAYLOAD));
    }).pipe(Effect.provide(tokensWith(KEY_1)))
  );

  it.effect("refuses a token with any part changed", () =>
    Effect.gen(function* tampered() {
      const token = yield* sign();
      const [version = "", body = "", tag = ""] = token.split(".");

      const changed = [
        `${version === "1" ? "2" : "1"}.${body}.${tag}`,
        `${version}.${swapCharacter(body, 4)}.${tag}`,
        `${version}.${body}.${swapCharacter(tag, 4)}`,
        `${version}.${body}`,
        `${token}.extra`,
        "",
      ];

      for (const candidate of changed) {
        const result = yield* verify(candidate);

        assert.isTrue(Exit.isFailure(result), candidate);
      }
    }).pipe(Effect.provide(tokensWith(`${KEY_1},${KEY_2}`)))
  );

  it.effect("refuses a token signed by another install's keys", () =>
    Effect.gen(function* otherKeys() {
      const token = yield* sign().pipe(Effect.provide(tokensWith(KEY_2)));

      const result = yield* verify(token.replace(/^2\./u, "1.")).pipe(
        Effect.provide(tokensWith(KEY_1))
      );

      assert.isTrue(Exit.isFailure(result));
    })
  );

  it.effect("refuses a token once its expiry has passed", () =>
    Effect.gen(function* expiry() {
      const now = yield* DateTime.now;
      const token = yield* sign({ expiresAt: DateTime.add(now, { hours: 1 }) });

      yield* TestClock.adjust("59 minutes");
      assert.deepStrictEqual(yield* verify(token), Exit.succeed(PAYLOAD));

      yield* TestClock.adjust("1 minute");
      assert.isTrue(Exit.isFailure(yield* verify(token)));
    }).pipe(Effect.provide(tokensWith(KEY_1)))
  );

  it.effect(
    "signs with the newest key and still accepts tokens signed with an older one until it's removed",
    () =>
      Effect.gen(function* rotation() {
        const before = yield* sign().pipe(Effect.provide(tokensWith(KEY_1)));

        const after = yield* Effect.gen(function* rotated() {
          assert.deepStrictEqual(yield* verify(before), Exit.succeed(PAYLOAD));

          return yield* sign();
        }).pipe(Effect.provide(tokensWith(`${KEY_1},${KEY_2}`)));

        assert.isTrue(after.startsWith("2."));

        const removed = yield* verify(before).pipe(
          Effect.provide(tokensWith(KEY_2))
        );

        assert.isTrue(Exit.isFailure(removed));
      })
  );
});
