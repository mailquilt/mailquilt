import { Schema } from "effect";

/**
 * Who may create an account on this install: only people who were invited
 * (the default), or anyone who finds it.
 */
export const SignUpPolicySchema = Schema.Literals(["invite-only", "open"]);

export type SignUpPolicy = typeof SignUpPolicySchema.Type;

/**
 * Where the System Mailer's settings come from: the instance settings page,
 * or environment variables, which win and can't be changed from the page.
 */
export const SystemMailerSourceSchema = Schema.Literals([
  "settings",
  "environment",
]);

export type SystemMailerSource = typeof SystemMailerSourceSchema.Type;
