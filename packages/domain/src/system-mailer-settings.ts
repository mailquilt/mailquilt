import { Schema } from "effect";

import { SystemMailerSourceSchema } from "./instance.ts";
import { Sender, SmtpServer } from "./provider-connection.ts";

/**
 * The SMTP server Mailquilt sends its own account emails through, as the
 * instance admin sees it: without its credentials, only whether it has
 * them (`signsIn`).
 */
export class SystemMailerSettings extends Schema.Class<SystemMailerSettings>(
  "SystemMailerSettings"
)({
  source: SystemMailerSourceSchema,
  from: Sender,
  smtp: SmtpServer,
  signsIn: Schema.Boolean,
}) {}
