import type { Role } from "@repo/domain";

/** A member's role, as the dashboard names it. */
export const ROLE_LABELS = {
  admin: "Admin",
  member: "Member",
  owner: "Owner",
} as const satisfies Record<Role, string>;

/** Completes "…, and you’re …" for the person's role. */
export const YOUR_ROLE = {
  admin: "an admin",
  member: "a member",
  owner: "its owner",
} as const satisfies Record<Role, string>;
