import { MailquiltApi } from "@repo/contract";
import {
  asMemberOf,
  createOrganization,
  getOrganization,
  listOrganizations,
} from "@repo/core";
import { HttpApiBuilder } from "effect/http-api";

import { signedIn } from "./auth/signed-in.ts";

/**
 * Endpoints for one Organization's data run `asMemberOf` its ID from the
 * path, which is the only way to get the `CurrentOrganization` their
 * repositories require (ADR 0007).
 */
export const OrganizationsHandlers = HttpApiBuilder.group(
  MailquiltApi,
  "organizations",
  (handlers) =>
    handlers
      .handle("list", () => signedIn(listOrganizations))
      .handle("create", ({ payload }) =>
        signedIn(createOrganization(payload.name))
      )
      .handle("get", ({ params }) =>
        getOrganization.pipe(asMemberOf(params.organizationId), signedIn)
      )
);
