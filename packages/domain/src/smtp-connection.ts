import { Schema } from "effect";

import { providerConnectionFields, SmtpServer } from "./provider-connection.ts";

/**
 * One Organization's configured SMTP server, as the API shows it: without
 * its credentials, only whether it has saved ones (`signsIn`).
 * `emailsPerMinute` is its sending rate, `null` when it has none.
 * `usesBounceAddress` says whether its Campaign emails are sent from a
 * signed bounce address, so their bounces come back to Mailquilt (ADR 0021).
 */
export class SmtpConnection extends Schema.Class<SmtpConnection>(
  "SmtpConnection"
)({
  ...providerConnectionFields,
  provider: Schema.Literal("smtp"),
  smtp: SmtpServer,
  signsIn: Schema.Boolean,
  usesBounceAddress: Schema.Boolean,
}) {}
