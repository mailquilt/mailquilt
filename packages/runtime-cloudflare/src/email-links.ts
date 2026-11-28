import { BounceDomain, PublicUrl, signedTokensLayer } from "@repo/core";
import { Effect, Layer, Option } from "effect";
import type { Redacted } from "effect";

// WARNING: a domain name only, as Email Routing receives mail for one, in lowercase so it matches however a bounce writes it.
const DOMAIN_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/u;

const bounceDomainLayer = (bounceDomain: string | undefined) =>
  Layer.effect(
    BounceDomain,
    Effect.suspend(() => {
      if (bounceDomain === undefined || bounceDomain === "") {
        return Effect.succeed({ domain: Option.none<string>() });
      }

      return DOMAIN_NAME.test(bounceDomain)
        ? Effect.succeed({ domain: Option.some(bounceDomain) })
        : Effect.die(
            new Error(
              "BOUNCE_DOMAIN must be a domain name in lowercase, such as bounces.mail.example.com"
            )
          );
    })
  );

/**
 * What links in emails need: `SignedTokens` keyed from `ENCRYPTION_KEYS`
 * (ADR 0016), and `PublicUrl` from `APP_URL`, and the `BounceDomain` from
 * `BOUNCE_DOMAIN`, none when it's unset (ADR 0021). A bad `APP_URL` or
 * `BOUNCE_DOMAIN` fails every request, queue delivery and email.
 */
export const emailLinksLive = (
  appUrl: string,
  encryptionKeys: Redacted.Redacted<string>,
  bounceDomain: string | undefined
) =>
  Layer.mergeAll(
    signedTokensLayer(encryptionKeys),
    bounceDomainLayer(bounceDomain),
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
