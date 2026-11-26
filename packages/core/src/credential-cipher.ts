import { Context, Effect, Layer, Redacted, Result } from "effect";
import { Aead, SecureRandom } from "effect/crypto";
import { Base64, Base64Url } from "effect/encoding";

import { CredentialsUnreadable } from "./credentials-unreadable.ts";
import { parseEncryptionKeys } from "./encryption-keys.ts";

const NONCE_LENGTH = 12;

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

const aesKeys = (keys: string) =>
  Effect.gen(function* aesKeysByVersion() {
    const { byVersion: bytesByVersion, newestVersion } =
      yield* parseEncryptionKeys(keys);

    const byVersion = new Map<number, Aead.Key<Aead.AesGcm>>();

    for (const [version, bytes] of bytesByVersion) {
      byVersion.set(version, yield* Aead.key(Aead.aes256Gcm, bytes));
    }

    const newestKey = byVersion.get(newestVersion);

    if (newestKey === undefined) {
      return yield* Effect.die(new Error("ENCRYPTION_KEYS has no newest key"));
    }

    return { byVersion, newest: { key: newestKey, version: newestVersion } };
  }).pipe(Effect.orDie);

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
      const { byVersion, newest } = yield* aesKeys(Redacted.value(keys));

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
