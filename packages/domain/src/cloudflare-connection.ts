import { Schema } from "effect";

import {
  CloudflareAccount,
  providerConnectionFields,
} from "./provider-connection.ts";

/**
 * One Organization's Cloudflare Email account, as the API shows it: its
 * account ID, never its API token, which it always has. `emailsPerMinute`
 * is its sending rate, `null` when it has none. Cloudflare Email is in beta.
 */
export class CloudflareConnection extends Schema.Class<CloudflareConnection>(
  "CloudflareConnection"
)({
  ...providerConnectionFields,
  provider: Schema.Literal("cloudflare"),
  cloudflare: CloudflareAccount,
}) {}
