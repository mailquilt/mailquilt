import { BounceDomain, PublicUrl, signedTokensLayer } from "@repo/core";
import { Config, Effect, Layer, Option } from "effect";

/**
 * What links in emails need: `SignedTokens` keyed from `ENCRYPTION_KEYS`
 * (ADR 0016), and `PublicUrl` from `APP_URL`. The app doesn't start without
 * both. Docker receives no bounces yet, so it has no `BounceDomain` (ADR
 * 0021).
 */
export const EmailLinksFromEnv = Layer.unwrap(
  Effect.gen(function* emailLinksFromEnv() {
    const keys = yield* Config.Redacted("ENCRYPTION_KEYS");
    const appUrl = URL.parse(yield* Config.NonEmptyString("APP_URL"));

    if (
      appUrl === null ||
      (appUrl.protocol !== "https:" && appUrl.protocol !== "http:")
    ) {
      return yield* Effect.die(
        new Error("APP_URL must be an absolute http or https URL")
      );
    }

    return Layer.mergeAll(
      signedTokensLayer(keys),
      Layer.succeed(PublicUrl, { origin: appUrl.origin }),
      Layer.succeed(BounceDomain, { domain: Option.none() })
    );
  })
);
