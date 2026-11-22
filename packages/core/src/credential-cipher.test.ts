import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Redacted } from "effect";
import { Base64 } from "effect/encoding";

import {
  CredentialCipher,
  credentialCipherLayer,
} from "./credential-cipher.ts";
import type { SealedSecret } from "./credential-cipher.ts";

const KEY_1 = Base64.encode(new Uint8Array(32).fill(1));

const KEY_2 = Base64.encode(new Uint8Array(32).fill(2));

const cipherWith = (keys: string) => credentialCipherLayer(Redacted.make(keys));

const SECRET = "passwordpassword";

const CONNECTION = "provider_connections:org_a:pcn_a";

const sealSecret = Effect.gen(function* sealWithCipher() {
  const cipher = yield* CredentialCipher;

  return yield* cipher.seal(Redacted.make(SECRET), CONNECTION);
});

const openSecret = (sealed: SealedSecret) =>
  Effect.gen(function* openWithCipher() {
    const cipher = yield* CredentialCipher;

    return yield* cipher.open(sealed, CONNECTION);
  });

describe("sealing credentials", () => {
  it.effect("opens what it sealed, and the sealed value hides it", () =>
    Effect.gen(function* roundTrip() {
      const cipher = yield* CredentialCipher;
      const sealed = yield* cipher.seal(Redacted.make(SECRET), CONNECTION);
      const opened = yield* cipher.open(sealed, CONNECTION);

      assert.strictEqual(sealed.keyVersion, 1);
      assert.notInclude(sealed.value, SECRET);
      assert.strictEqual(Redacted.value(opened), SECRET);
    }).pipe(Effect.provide(cipherWith(`1:${KEY_1}`)))
  );

  it.effect(
    "seals with the newest key and still opens values sealed with an older one",
    () =>
      Effect.gen(function* rotation() {
        const before = yield* sealSecret.pipe(
          Effect.provide(cipherWith(`1:${KEY_1}`))
        );

        const rotated = cipherWith(`1:${KEY_1},2:${KEY_2}`);

        const after = yield* sealSecret.pipe(Effect.provide(rotated));
        const opened = yield* openSecret(before).pipe(Effect.provide(rotated));

        assert.strictEqual(after.keyVersion, 2);
        assert.strictEqual(Redacted.value(opened), SECRET);
      })
  );

  it.effect("refuses a value sealed for another row", () =>
    Effect.gen(function* movedValue() {
      const cipher = yield* CredentialCipher;
      const sealed = yield* cipher.seal(Redacted.make(SECRET), CONNECTION);

      const error = yield* cipher
        .open(sealed, "provider_connections:org_b:pcn_b")
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "CredentialsUnreadable");
    }).pipe(Effect.provide(cipherWith(`1:${KEY_1}`)))
  );

  it.effect("refuses a value sealed with a key it no longer has", () =>
    Effect.gen(function* removedKey() {
      const sealed = yield* sealSecret.pipe(
        Effect.provide(cipherWith(`1:${KEY_1}`))
      );

      const error = yield* openSecret(sealed).pipe(
        Effect.provide(cipherWith(`2:${KEY_2}`)),
        Effect.flip
      );

      assert.strictEqual(error._tag, "CredentialsUnreadable");
    })
  );

  it.effect.each([
    ["no key", ""],
    ["a key shorter than 32 bytes", `1:${Base64.encode(new Uint8Array(16))}`],
    ["a key without a version", KEY_1],
    ["two keys with the same version", `1:${KEY_1},1:${KEY_2}`],
  ] as const)("refuses to start with %s", ([, keys]) =>
    Effect.gen(function* badKeys() {
      const exit = yield* Effect.gen(function* built() {
        yield* CredentialCipher;
      }).pipe(Effect.provide(cipherWith(keys)), Effect.exit);

      assert.isTrue(Exit.hasDies(exit));
    })
  );
});
