import { Context, DateTime, Effect, Layer, Redacted, Result } from "effect";
import { Kdf, Mac, SecureRandom } from "effect/crypto";
import { Base64, Base64Url } from "effect/encoding";

import { parseEncryptionKeys } from "./encryption-keys.ts";
import { InvalidToken } from "./invalid-token.ts";

const VERSION = /^[1-9]\d{0,8}$/u;

const EXPIRY = /^(?<expires>\d*):/u;

const KEY_BYTES = 32;

const NO_SALT = new Uint8Array(KEY_BYTES);

// WARNING: the TypeID alphabet (ADR 0006), lowercase, so a compact token survives a mail server that changes an address's case.
const BASE32 = "0123456789abcdefghjkmnpqrstvwxyz";

// WARNING: 80 bits of HMAC: guessing one takes 2^79 tries on average, each a message to the install, and 10 bytes fill 16 base32 characters exactly (ADR 0021).
const COMPACT_TAG_BYTES = 10;

const COMPACT_PAYLOAD = /^[0-9a-z]+$/u;

const COMPACT_TOKEN =
  /^(?<payload>[0-9a-z]+)-(?<version>[1-9]\d{0,8})-(?<tag>[0-9a-hjkmnp-tv-z]{16})$/u;

const TAG_CHARACTERS = 16;

const BASE = 32n;

const BYTE = 256n;

// WARNING: 10 bytes are 80 bits, exactly 16 base32 characters, so the tag needs no padding; this works for that length only.
const base32 = (bytes: Uint8Array) => {
  let value = 0n;

  for (const byte of bytes) {
    value = value * BYTE + BigInt(byte);
  }

  let encoded = "";

  for (let index = TAG_CHARACTERS - 1; index >= 0; index -= 1) {
    encoded += BASE32[Number((value / BASE ** BigInt(index)) % BASE)];
  }

  return encoded;
};

// WARNING: compares every character, never stopping at the first difference, so the time taken doesn't tell how much of a guessed tag was right. Both tags are 16 characters: the token's pattern requires it.
const sameTag = (left: string, right: string) => {
  let same = true;

  for (let index = 0; index < left.length; index += 1) {
    same = left[index] === right[index] && same;
  }

  return same;
};

/**
 * What a token is for. Each purpose signs with its own key, so a token made
 * for one can never pass as another.
 */
export type TokenPurpose =
  | "unsubscribe"
  | "preferences"
  | "ses-notifications"
  | "bounce";

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
    /** Signs `payload`, lowercase letters and digits only, as a compact token. */
    readonly signCompact: (
      purpose: TokenPurpose,
      payload: string
    ) => Effect.Effect<string>;
    /** Gives back a compact token's payload, in any case it comes back in. */
    readonly verifyCompact: (
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

      const compactTag = (key: Mac.Key, version: number, payload: string) =>
        mac.sign(key, utf8(`${version}-${payload}`)).pipe(
          Effect.map((tag) => base32(tag.slice(0, COMPACT_TAG_BYTES))),
          Effect.orDie
        );

      return {
        signCompact: (purpose, payload) =>
          Effect.gen(function* signCompact() {
            const key = yield* keyFor(newestVersion, purpose);

            if (key === null) {
              return yield* Effect.die(new Error("No key to sign with"));
            }

            if (!COMPACT_PAYLOAD.test(payload)) {
              return yield* Effect.die(
                new Error(
                  "A compact token's payload is lowercase letters and digits"
                )
              );
            }

            const tag = yield* compactTag(key, newestVersion, payload);

            return `${payload}-${newestVersion}-${tag}`;
          }),

        verifyCompact: (purpose, token) =>
          Effect.gen(function* verifyCompact() {
            const parts = COMPACT_TOKEN.exec(token.toLowerCase())?.groups;

            if (parts === undefined) {
              return yield* new InvalidToken();
            }

            const { payload = "", tag = "" } = parts;
            const version = Number(parts.version);
            const key = yield* keyFor(version, purpose);

            if (key === null) {
              return yield* new InvalidToken();
            }

            const expected = yield* compactTag(key, version, payload);

            if (!sameTag(expected, tag)) {
              return yield* new InvalidToken();
            }

            return payload;
          }),

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
