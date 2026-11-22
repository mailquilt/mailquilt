import { Schema } from "effect";

import { SignUpPolicySchema } from "./instance.ts";

/**
 * What anyone may know about the install before signing in: whether its
 * first-run setup has made the instance admin, and who may sign up.
 */
export class InstanceStatus extends Schema.Class<InstanceStatus>(
  "InstanceStatus"
)({
  setUp: Schema.Boolean,
  signUp: SignUpPolicySchema,
}) {}
