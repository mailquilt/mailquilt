import { Schema } from "effect";

import { CloudflareConnection } from "./cloudflare-connection.ts";
import { SesConnection } from "./ses-connection.ts";
import { SmtpConnection } from "./smtp-connection.ts";

/** One Organization's configured sending service, told apart by `provider`. */
export const ProviderConnectionSchema = Schema.Union([
  SmtpConnection,
  SesConnection,
  CloudflareConnection,
]);

export type ProviderConnection = typeof ProviderConnectionSchema.Type;
