import { credentialCipherLayer } from "@repo/core";
import { Config, Effect, Layer } from "effect";

/**
 * Seals Provider Connection credentials with the keys in `ENCRYPTION_KEYS`
 * (ADR 0009). The app doesn't start without it.
 */
export const CredentialCipherFromEnv = Layer.unwrap(
  Effect.gen(function* credentialCipherFromEnv() {
    return credentialCipherLayer(yield* Config.Redacted("ENCRYPTION_KEYS"));
  })
);
