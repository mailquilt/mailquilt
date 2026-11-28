import { Context } from "effect";
import type { Option } from "effect";

/**
 * The domain this install receives bounces at, such as
 * `bounces.mail.example.com`, or `None` when it receives none. On Cloudflare
 * it's `BOUNCE_DOMAIN`, whose mail Email Routing hands to the Worker; Docker
 * receives none yet (ADR 0021).
 */
export class BounceDomain extends Context.Service<
  BounceDomain,
  { readonly domain: Option.Option<string> }
>()("@repo/core/BounceDomain") {}
