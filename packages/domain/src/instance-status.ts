import { Schema } from "effect";

import { SignUpPolicySchema } from "./instance.ts";

/**
 * What anyone may know about the install before signing in: whether its
 * first-run setup has made the instance admin, who may sign up, and the
 * domain it receives bounces at, `null` when it receives none. The bounce
 * domain is in every bounce address's Return-Path anyway (ADR 0021).
 */
export class InstanceStatus extends Schema.Class<InstanceStatus>(
  "InstanceStatus"
)({
  setUp: Schema.Boolean,
  signUp: SignUpPolicySchema,
  bounceDomain: Schema.NullOr(Schema.String),
}) {}
