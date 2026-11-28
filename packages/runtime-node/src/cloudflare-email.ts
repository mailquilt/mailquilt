import { cloudflareEmailProviderLayer } from "@repo/providers/cloudflare-email";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

/**
 * Sends through Cloudflare Email with the platform's `fetch`. Its API is
 * always Cloudflare's own, so these requests don't go through the outbound
 * guard (ADR 0010).
 */
export const CloudflareEmailProviderLive = cloudflareEmailProviderLayer.pipe(
  Layer.provide(FetchHttpClient.layer)
);
