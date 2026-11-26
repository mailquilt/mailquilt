import { OrganizationIdSchema } from "@repo/domain";

/** The path parameter of every endpoint for one Organization's data (ADR 0007). */
export const organizationParams = { organizationId: OrganizationIdSchema };
