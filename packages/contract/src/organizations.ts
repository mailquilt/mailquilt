import { Organization, OrganizationName, PostalAddress } from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { OrganizationNotFoundError, SignInRequiredError } from "./errors.ts";
import { organizationParams } from "./params.ts";

/**
 * The Organizations the signed-in person belongs to. Endpoints for one
 * Organization's data name it in the path, under
 * `/organizations/:organizationId`, and answer only its members (ADR 0007).
 */
export class OrganizationsApi extends HttpApiGroup.make("organizations")
  .add(
    HttpApiEndpoint.get("list", "/organizations", {
      error: SignInRequiredError,
      success: Schema.Array(Organization),
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/organizations", {
      error: SignInRequiredError,
      payload: Schema.Struct({ name: OrganizationName }),
      success: Organization.pipe(HttpApiSchema.status(201)),
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/organizations/:organizationId", {
      error: [SignInRequiredError, OrganizationNotFoundError],
      params: organizationParams,
      success: Organization,
    })
  )
  .add(
    HttpApiEndpoint.put(
      "updatePostalAddress",
      "/organizations/:organizationId/postal-address",
      {
        error: [SignInRequiredError, OrganizationNotFoundError],
        params: organizationParams,
        payload: Schema.Struct({ postalAddress: PostalAddress }),
        success: Organization,
      }
    )
  ) {}
