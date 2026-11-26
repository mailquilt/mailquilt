import { PublicUrl, signedTokensLayer } from "@repo/core";
import { Effect, Layer } from "effect";
import type { Redacted } from "effect";

/**
 * What links in emails need: `SignedTokens` keyed from `ENCRYPTION_KEYS`
 * (ADR 0016), and `PublicUrl` from `APP_URL`. A bad `APP_URL` fails every
 * request and queue delivery.
 */
export const emailLinksLive = (
  appUrl: string,
  encryptionKeys: Redacted.Redacted<string>
) =>
  Layer.merge(
    signedTokensLayer(encryptionKeys),
    Layer.effect(
      PublicUrl,
      Effect.suspend(() => {
        const url = URL.parse(appUrl);

        return url === null ||
          (url.protocol !== "https:" && url.protocol !== "http:")
          ? Effect.die(
              new Error("APP_URL must be an absolute http or https URL")
            )
          : Effect.succeed({ origin: url.origin });
      })
    )
  );
