import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Exit, Redacted } from "effect";
import { Base64 } from "effect/encoding";
import { TestClock } from "effect/testing";

import { InvalidToken } from "./invalid-token.ts";
import { SignedTokens, signedTokensLayer } from "./signed-tokens.ts";

const KEY_1 = `1:${Base64.encode(new Uint8Array(32).fill(1))}`;

const KEY_2 = `2:${Base64.encode(new Uint8Array(32).fill(2))}`;

const ANOTHER_INSTALLS_KEY_1 = `1:${Base64.encode(new Uint8Array(32).fill(9))}`;

const REFUSED = Exit.fail(new InvalidToken());

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

        assert.deepStrictEqual(result, REFUSED, candidate);
      }
    }).pipe(Effect.provide(tokensWith(`${KEY_1},${KEY_2}`)))
  );

  it.effect("refuses a token signed by another install's keys", () =>
    Effect.gen(function* otherKeys() {
      const token = yield* sign().pipe(
        Effect.provide(tokensWith(ANOTHER_INSTALLS_KEY_1))
      );

      const result = yield* verify(token).pipe(
        Effect.provide(tokensWith(KEY_1))
      );

      assert.deepStrictEqual(result, REFUSED);
    })
  );

  it.effect("refuses a token once its expiry has passed", () =>
    Effect.gen(function* expiry() {
      const now = yield* DateTime.now;
      const token = yield* sign({ expiresAt: DateTime.add(now, { hours: 1 }) });

      yield* TestClock.adjust("59 minutes");
      assert.deepStrictEqual(yield* verify(token), Exit.succeed(PAYLOAD));

      yield* TestClock.adjust("1 minute");
      assert.deepStrictEqual(yield* verify(token), REFUSED);
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

        assert.deepStrictEqual(removed, REFUSED);
      })
  );
});

const COMPACT_PAYLOAD =
  "01h455vb4pex5vsknk084sn02q01h455vb4pex5vsknk084sn02r01h455vb4pex5vsknk084sn02s";

const signCompact = Effect.gen(function* signCompactPayload() {
  const tokens = yield* SignedTokens;

  return yield* tokens.signCompact("bounce", COMPACT_PAYLOAD);
});

const verifyCompact = (token: string) =>
  Effect.gen(function* verifyCompactToken() {
    const tokens = yield* SignedTokens;

    return yield* tokens.verifyCompact("bounce", token).pipe(Effect.exit);
  });

const swapLowercase = (text: string, index: number) =>
  `${text.slice(0, index)}${text[index] === "a" ? "b" : "a"}${text.slice(index + 1)}`;

describe("compact signed tokens", () => {
  it.effect(
    "gives back the payload in lowercase letters and digits, whatever case the token comes back in",
    () =>
      Effect.gen(function* roundTrip() {
        const token = yield* signCompact;

        assert.match(token, /^[0-9a-z-]+$/u);
        assert.deepStrictEqual(
          yield* verifyCompact(token),
          Exit.succeed(COMPACT_PAYLOAD)
        );
        assert.deepStrictEqual(
          yield* verifyCompact(token.toUpperCase()),
          Exit.succeed(COMPACT_PAYLOAD)
        );
      }).pipe(Effect.provide(tokensWith(KEY_1)))
  );

  it.effect(
    "refuses a compact token with any part changed, or made for another purpose",
    () =>
      Effect.gen(function* tampered() {
        const tokens = yield* SignedTokens;
        const token = yield* signCompact;
        const [payload = "", version = "", tag = ""] = token.split("-");

        const forOtherPurpose = yield* tokens.signCompact(
          "unsubscribe",
          COMPACT_PAYLOAD
        );

        const changed = [
          `${swapLowercase(payload, 30)}-${version}-${tag}`,
          `${payload}-${version === "1" ? "2" : "1"}-${tag}`,
          `${payload}-${version}-${swapLowercase(tag, 4)}`,
          `${payload}-${version}-${tag.slice(1)}`,
          `${payload}-${tag}`,
          `${token}-extra`,
          forOtherPurpose,
          "",
        ];

        for (const candidate of changed) {
          const result = yield* verifyCompact(candidate);

          assert.deepStrictEqual(result, REFUSED, candidate);
        }
      }).pipe(Effect.provide(tokensWith(`${KEY_1},${KEY_2}`)))
  );

  it.effect("refuses a compact token signed by another install's keys", () =>
    Effect.gen(function* otherKeys() {
      const token = yield* signCompact.pipe(
        Effect.provide(tokensWith(ANOTHER_INSTALLS_KEY_1))
      );

      const result = yield* verifyCompact(token).pipe(
        Effect.provide(tokensWith(KEY_1))
      );

      assert.deepStrictEqual(result, REFUSED);
    })
  );
});
