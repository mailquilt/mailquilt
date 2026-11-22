import { Schema } from "effect";

import { SignUpPolicySchema } from "./instance.ts";
import { SystemMailerSettings } from "./system-mailer-settings.ts";

/** The install's settings, for its instance admin. `systemMailer` is null until one is set. */
export class InstanceSettings extends Schema.Class<InstanceSettings>(
  "InstanceSettings"
)({
  signUp: SignUpPolicySchema,
  systemMailer: Schema.NullOr(SystemMailerSettings),
}) {}
