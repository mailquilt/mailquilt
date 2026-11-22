import { OrganizationNotFound, SignInRequired } from "@repo/domain";
import { HttpApiSchema } from "effect/http-api";

/** No valid session, or a write from another site's page. */
export const SignInRequiredError = SignInRequired.pipe(
  HttpApiSchema.status(401)
);

/** The Organization doesn't exist, or the person asking isn't a member. */
export const OrganizationNotFoundError = OrganizationNotFound.pipe(
  HttpApiSchema.status(404)
);
