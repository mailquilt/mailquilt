import { Schema } from "effect";

import { providerConnectionFields, SesAccount } from "./provider-connection.ts";

/**
 * One Organization's SES account, as the API shows it: its Region, never
 * its access key, which it always has. `emailsPerMinute` is its sending
 * rate, `null` to keep to the account's own sending limit.
 */
export class SesConnection extends Schema.Class<SesConnection>("SesConnection")(
  {
    ...providerConnectionFields,
    provider: Schema.Literal("ses"),
    ses: SesAccount,
  }
) {}
