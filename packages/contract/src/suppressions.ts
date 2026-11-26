import {
  ContactEmail,
  MAX_SUPPRESSIONS_ADDED_AT_ONCE,
  SuppressionIdSchema,
  SuppressionPage,
  SuppressionsAdded,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import {
  OrganizationNotFoundError,
  SignInRequiredError,
  SuppressionNotFoundError,
  SuppressionNotRemovableError,
} from "./errors.ts";
import { organizationParams } from "./params.ts";

/** Which page of Suppressions to list: `after` and `before` are another page's `next` and `previous` cursors (ADR 0008). */
export const SuppressionQuery = Schema.Struct({
  after: Schema.optionalKey(SuppressionIdSchema),
  before: Schema.optionalKey(SuppressionIdSchema),
}).check(
  Schema.makeFilter(
    (query) => query.after === undefined || query.before === undefined,
    { message: "Ask for the page after one cursor or before it, not both." }
  )
);

/**
 * An Organization's Suppressions. `add` Suppresses addresses by hand, up to
 * 250 at a time, so a longer CSV file goes in several requests; an address
 * already Suppressed keeps its Suppression as it was. `remove` takes away
 * only one added by hand.
 */
export class SuppressionsApi extends HttpApiGroup.make("suppressions")
  .add(
    HttpApiEndpoint.get("list", "/organizations/:organizationId/suppressions", {
      error: [SignInRequiredError, OrganizationNotFoundError],
      params: organizationParams,
      query: SuppressionQuery,
      success: SuppressionPage,
    })
  )
  .add(
    HttpApiEndpoint.post("add", "/organizations/:organizationId/suppressions", {
      error: [SignInRequiredError, OrganizationNotFoundError],
      params: organizationParams,
      payload: Schema.Struct({
        emails: Schema.NonEmptyArray(ContactEmail).check(
          Schema.isMaxLength(MAX_SUPPRESSIONS_ADDED_AT_ONCE)
        ),
      }),
      success: SuppressionsAdded,
    })
  )
  .add(
    HttpApiEndpoint.delete(
      "remove",
      "/organizations/:organizationId/suppressions/:suppressionId",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          SuppressionNotFoundError,
          SuppressionNotRemovableError,
        ],
        params: { ...organizationParams, suppressionId: SuppressionIdSchema },
        success: HttpApiSchema.NoContent,
      }
    )
  ) {}
