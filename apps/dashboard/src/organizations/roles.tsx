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

/** The person's role, as a badge in the same style as the sidebar's "Soon". */
export const RoleBadge = ({
  className = "",
  role,
}: {
  className?: string;
  role: Role;
}) => (
  <span
    className={`shrink-0 rounded-sm bg-kumo-tint px-1.5 text-xs font-medium text-kumo-subtle ${className}`}
  >
    {ROLE_LABELS[role]}
  </span>
);
