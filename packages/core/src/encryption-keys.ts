import { Effect, Result } from "effect";
import { Base64 } from "effect/encoding";

const KEY_ENTRY = /^(?<version>[1-9]\d{0,8}):(?<key>[A-Za-z0-9+/]+={0,2})$/u;

const KEY_BYTES = 32;

const misconfigured = (problem: string) =>
  Effect.die(
    new Error(
      `ENCRYPTION_KEYS ${problem}. Set it to one or more "version:key" entries separated by commas, each key 32 random bytes in base64, such as "1:$(openssl rand -base64 32)".`
    )
  );

/**
 * Reads the `ENCRYPTION_KEYS` setting: one or more `version:key` entries,
 * each key 32 bytes in base64. Returns each version's bytes and the highest
 * version, which new values use. A missing or malformed key stops the app.
 */
export const parseEncryptionKeys = (keys: string) =>
  Effect.gen(function* parseKeys() {
    const entries = keys
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (entries.length === 0) {
      return yield* misconfigured("is empty");
    }

    const byVersion = new Map<number, Uint8Array>();

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

      if (bytes.success.length !== KEY_BYTES) {
        return yield* misconfigured(`key ${version} isn't 32 bytes`);
      }

      byVersion.set(version, bytes.success);
    }

    return { byVersion, newestVersion: Math.max(...byVersion.keys()) };
  });
