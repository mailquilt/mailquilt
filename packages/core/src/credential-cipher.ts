import { Context, Effect, Layer, Redacted, Result } from "effect";
import { Aead, SecureRandom } from "effect/crypto";
import { Base64, Base64Url } from "effect/encoding";

import { CredentialsUnreadable } from "./credentials-unreadable.ts";

const NONCE_LENGTH = 12;

const KEY_ENTRY = /^(?<version>[1-9]\d{0,8}):(?<key>[A-Za-z0-9+/]+={0,2})$/u;

/** A secret as stored: the version of the key that sealed it, and the nonce and ciphertext in base64url. */
export interface SealedSecret {
  readonly keyVersion: number;
  readonly value: string;
}

/**
 * Port: seals secrets for storage, such as a Provider Connection's
 * credentials, and opens them again. `context` names the row a secret
 * belongs to; a secret opens only with the context it was sealed with, so a
 * sealed value copied to another row or Organization can't be read there
 * (ADR 0009).
 */
export class CredentialCipher extends Context.Service<
  CredentialCipher,
  {
    readonly seal: (
      secret: Redacted.Redacted<string>,
      context: string
    ) => Effect.Effect<SealedSecret>;
    readonly open: (
      sealed: SealedSecret,
      context: string
    ) => Effect.Effect<Redacted.Redacted<string>, CredentialsUnreadable>;
  }
>()("@repo/core/CredentialCipher") {}

const misconfigured = (problem: string) =>
  Effect.die(
    new Error(
      `ENCRYPTION_KEYS ${problem}. Set it to one or more "version:key" entries separated by commas, each key 32 random bytes in base64, such as "1:$(openssl rand -base64 32)".`
    )
  );

const parseKeys = (keys: string) =>
  Effect.gen(function* parseEncryptionKeys() {
    const entries = keys
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (entries.length === 0) {
      return yield* misconfigured("is empty");
    }

    const byVersion = new Map<number, Aead.Key<Aead.AesGcm>>();

    let newest:
      | { readonly version: number; readonly key: Aead.Key }
      | undefined;

    for (const entry of entries) {
      const match = KEY_ENTRY.exec(entry)?.groups;
      const bytes = Base64.decode(match?.key ?? "");

      if (match?.version === undefined || Result.isFailure(bytes)) {
        return yield* misconfigured("has an entry that isn't version:key");
      }

      const version = Number(match.version);

      if (byVersion.has(version)) {
        return yield* misconfigured(`has key version ${version} twice`);
      }

      const key = yield* Aead.key(Aead.aes256Gcm, bytes.success).pipe(
        Effect.catch(() => misconfigured(`key ${version} isn't 32 bytes`))
      );

      byVersion.set(version, key);

      if (newest === undefined || version > newest.version) {
        newest = { key, version };
      }
    }

    if (newest === undefined) {
      return yield* misconfigured("is empty");
    }

    return { byVersion, newest };
  });

// WARNING: core's types have neither runtime's globals, so no TextEncoder; Effect's Base64 reads and writes strings as UTF-8.
const utf8 = (text: string) =>
  Result.getOrThrow(Base64.decode(Base64.encode(text)));

const fromUtf8 = (bytes: Uint8Array) =>
  Base64.decodeString(Base64.encode(bytes));

/**
 * Seals with AES-256-GCM under the highest-numbered key in `keys` (the
 * `ENCRYPTION_KEYS` setting) and opens with whichever key a value names, so
 * a new key can be added and old values still open. A missing or malformed
 * key stops the app.
 */
export const credentialCipherLayer = (keys: Redacted.Redacted<string>) =>
  Layer.effect(
    CredentialCipher,
    Effect.gen(function* credentialCipher() {
      const { byVersion, newest } = yield* parseKeys(Redacted.value(keys));

      const aead = yield* Aead.Aead;
      const random = yield* SecureRandom.SecureRandom;

      return {
        open: (sealed, context) =>
          Effect.gen(function* open() {
            const key = byVersion.get(sealed.keyVersion);
            const bytes = Base64Url.decode(sealed.value);

            if (key === undefined || Result.isFailure(bytes)) {
              return yield* new CredentialsUnreadable();
            }

            const plaintext = yield* aead
              .decrypt(key, bytes.success.subarray(NONCE_LENGTH), {
                aad: utf8(context),
                nonce: bytes.success.subarray(0, NONCE_LENGTH),
              })
              .pipe(Effect.mapError(() => new CredentialsUnreadable()));

            const text = fromUtf8(plaintext);

            if (Result.isFailure(text)) {
              return yield* new CredentialsUnreadable();
            }

            return Redacted.make(text.success);
          }),

        seal: (secret, context) =>
          Effect.gen(function* seal() {
            const nonce = yield* random.randomBytes(NONCE_LENGTH);

            const ciphertext = yield* aead.encrypt(
              newest.key,
              utf8(Redacted.value(secret)),
              { aad: utf8(context), nonce }
            );

            const value = new Uint8Array(NONCE_LENGTH + ciphertext.length);
            value.set(nonce);
            value.set(ciphertext, NONCE_LENGTH);

            return {
              keyVersion: newest.version,
              value: Base64Url.encode(value),
            };
          }).pipe(Effect.orDie),
      };
    })
  ).pipe(
    Layer.provide(Aead.layerWebCrypto),
    Layer.provide(SecureRandom.layerWebCrypto)
  );
