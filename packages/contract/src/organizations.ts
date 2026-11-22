import {
  Organization,
  OrganizationIdSchema,
  OrganizationName,
  OrganizationNotFound,
  SignInRequired,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

const SignInRequiredError = SignInRequired.pipe(HttpApiSchema.status(401));

const OrganizationNotFoundError = OrganizationNotFound.pipe(
  HttpApiSchema.status(404)
);

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
      params: { organizationId: OrganizationIdSchema },
      success: Organization,
    })
  ) {}
