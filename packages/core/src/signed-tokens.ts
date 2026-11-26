import { Context, DateTime, Effect, Layer, Redacted, Result } from "effect";
import { Kdf, Mac, SecureRandom } from "effect/crypto";
import { Base64, Base64Url } from "effect/encoding";

import { parseEncryptionKeys } from "./encryption-keys.ts";
import { InvalidToken } from "./invalid-token.ts";

const VERSION = /^[1-9]\d{0,8}$/u;

const EXPIRY = /^(?<expires>\d*):/u;

const KEY_BYTES = 32;

const NO_SALT = new Uint8Array(KEY_BYTES);

/**
 * What a token is for. Each purpose signs with its own key, so a token made
 * for one can never pass as another.
 */
export type TokenPurpose = "unsubscribe";

/**
 * Port: signs short strings, such as the IDs an unsubscribe link acts on, so
 * a link in an email can be trusted when it comes back (ADR 0016). A token is
 * `version.body.tag`: the key version, the base64url body (its expiry, if
 * any, and the payload), and an HMAC-SHA-256 tag over both.
 */
export class SignedTokens extends Context.Service<
  SignedTokens,
  {
    readonly sign: (
      purpose: TokenPurpose,
      payload: string,
      options?: { readonly expiresAt?: DateTime.Utc }
    ) => Effect.Effect<string>;
    readonly verify: (
      purpose: TokenPurpose,
      token: string
    ) => Effect.Effect<string, InvalidToken>;
  }
>()("@repo/core/SignedTokens") {}

// WARNING: core's types have neither runtime's globals, so no TextEncoder; Effect's Base64 reads and writes strings as UTF-8.
const utf8 = (text: string) =>
  Result.getOrThrow(Base64.decode(Base64.encode(text)));

const fromUtf8 = (bytes: Uint8Array) =>
  Base64.decodeString(Base64.encode(bytes));

/**
 * Signs with keys derived from `keys` (the `ENCRYPTION_KEYS` setting) by
 * HKDF-SHA-256, one per key version and purpose. It signs with the highest
 * version and verifies with whichever version a token names, so adding a key
 * keeps every earlier token valid until its version is removed.
 */
export const signedTokensLayer = (keys: Redacted.Redacted<string>) =>
  Layer.effect(
    SignedTokens,
    Effect.gen(function* signedTokens() {
      const { byVersion, newestVersion } = yield* parseEncryptionKeys(
        Redacted.value(keys)
      );

      const kdf = yield* Kdf.Kdf;
      const mac = yield* Mac.Mac;

      const derived = new Map<string, Mac.Key>();

      const keyFor = (version: number, purpose: TokenPurpose) =>
        Effect.gen(function* keyForVersion() {
          const id = `${version}:${purpose}`;
          const cached = derived.get(id);

          if (cached !== undefined) {
            return cached;
          }

          const secret = byVersion.get(version);

          if (secret === undefined) {
            return null;
          }

          const bytes = yield* kdf.derive(Kdf.hkdfSha256, secret, {
            info: utf8(`mailquilt token ${purpose}`),
            length: KEY_BYTES,
            salt: NO_SALT,
          });

          const key = yield* Mac.key(Mac.hmacSha256, bytes);
          derived.set(id, key);

          return key;
        }).pipe(Effect.orDie);

      return {
        sign: (purpose, payload, options = {}) =>
          Effect.gen(function* sign() {
            const key = yield* keyFor(newestVersion, purpose);

            if (key === null) {
              return yield* Effect.die(new Error("No key to sign with"));
            }

            const expires =
              options.expiresAt === undefined
                ? ""
                : String(DateTime.toEpochMillis(options.expiresAt));

            const signed = `${newestVersion}.${Base64Url.encode(`${expires}:${payload}`)}`;
            const tag = yield* mac.sign(key, utf8(signed));

            return `${signed}.${Base64Url.encode(tag)}`;
          }).pipe(Effect.orDie),

        verify: (purpose, token) =>
          Effect.gen(function* verify() {
            const [version, body, tag, ...rest] = token.split(".");

            if (
              version === undefined ||
              !VERSION.test(version) ||
              body === undefined ||
              tag === undefined ||
              rest.length > 0
            ) {
              return yield* new InvalidToken();
            }

            const key = yield* keyFor(Number(version), purpose);
            const tagBytes = Base64Url.decode(tag);

            if (key === null || Result.isFailure(tagBytes)) {
              return yield* new InvalidToken();
            }

            const valid = yield* mac
              .verify(key, tagBytes.success, utf8(`${version}.${body}`))
              .pipe(Effect.orDie);

            const decoded = Base64Url.decode(body);

            if (!valid || Result.isFailure(decoded)) {
              return yield* new InvalidToken();
            }

            const text = fromUtf8(decoded.success);

            const expires = Result.isSuccess(text)
              ? EXPIRY.exec(text.success)
              : null;

            if (Result.isFailure(text) || expires === null) {
              return yield* new InvalidToken();
            }

            const expiresAt = expires.groups?.expires ?? "";
            const now = yield* DateTime.now;

            if (
              expiresAt !== "" &&
              DateTime.toEpochMillis(now) >= Number(expiresAt)
            ) {
              return yield* new InvalidToken();
            }

            return text.success.slice(expires[0].length);
          }),
      };
    })
  ).pipe(
    Layer.provide(Kdf.layerWebCrypto),
    Layer.provide(Mac.layerWebCrypto),
    Layer.provide(SecureRandom.layerWebCrypto)
  );
