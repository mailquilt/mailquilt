import { Schema } from "effect";

import { SesConnection } from "./ses-connection.ts";
import { SmtpConnection } from "./smtp-connection.ts";

/** One Organization's configured sending service, told apart by `provider`. */
export const ProviderConnectionSchema = Schema.Union([
  SmtpConnection,
  SesConnection,
]);

export type ProviderConnection = typeof ProviderConnectionSchema.Type;
