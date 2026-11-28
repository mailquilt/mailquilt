import type { CloudflareAccount, CloudflareCredentials } from "@repo/domain";
import { Context } from "effect";

import type { Provider } from "./provider-port.ts";

/** Which Cloudflare account a Cloudflare Email Provider Connection sends through, and its API token. */
export interface CloudflareEmailSettings {
  readonly account: typeof CloudflareAccount.Type;
  readonly credentials: typeof CloudflareCredentials.Type;
}

/**
 * Port: sends through Cloudflare Email, which is in beta. Cloudflare keeps
 * its own suppression list and sends Mailquilt no bounces or complaints.
 */
export class CloudflareEmailProvider extends Context.Service<
  CloudflareEmailProvider,
  Provider<CloudflareEmailSettings>
>()("@repo/core/CloudflareEmailProvider") {}
