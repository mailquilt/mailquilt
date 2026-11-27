import { sesProviderLayer } from "@repo/providers/ses";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

/**
 * Sends through Amazon SES with the platform's `fetch`. SES's endpoint is
 * always AWS's own, so these requests don't go through the outbound guard
 * (ADR 0010).
 */
export const SesProviderLive = sesProviderLayer.pipe(
  Layer.provide(FetchHttpClient.layer)
);
