import { Schema } from "effect";

import { OrganizationIdSchema } from "./ids.ts";

const MAX_NAME_LENGTH = 100;

/** What people call the Organization. Spaces around it are trimmed. */
export const OrganizationName = Schema.Trim.check(
  Schema.isNonEmpty({ message: "Enter a name for your organization." }),
  Schema.isMaxLength(MAX_NAME_LENGTH, {
    message: `Use at most ${MAX_NAME_LENGTH} characters.`,
  })
);

/** What a member may do in an Organization. The creator is its owner. */
export const RoleSchema = Schema.Literals(["owner", "admin", "member"]);

export type Role = typeof RoleSchema.Type;

/** An Organization, as one of its members sees it. */
export class Organization extends Schema.Class<Organization>("Organization")({
  id: OrganizationIdSchema,
  name: OrganizationName,
  /** The role of the person asking. */
  role: RoleSchema,
}) {}
