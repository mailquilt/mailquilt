import {
  Contact,
  ContactAlreadyExists,
  ContactEmail,
  ContactIdSchema,
  ContactPage,
  OrganizationIdSchema,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { OrganizationNotFoundError, SignInRequiredError } from "./errors.ts";

const params = { organizationId: OrganizationIdSchema };

/** An Organization's Contacts. */
export class ContactsApi extends HttpApiGroup.make("contacts")
  .add(
    HttpApiEndpoint.get("list", "/organizations/:organizationId/contacts", {
      error: [SignInRequiredError, OrganizationNotFoundError],
      params,
      /** `after` is the `next` cursor of the previous page (ADR 0008). */
      query: { after: Schema.optionalKey(ContactIdSchema) },
      success: ContactPage,
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/organizations/:organizationId/contacts", {
      error: [
        SignInRequiredError,
        OrganizationNotFoundError,
        ContactAlreadyExists.pipe(HttpApiSchema.status(409)),
      ],
      params,
      payload: Schema.Struct({ email: ContactEmail }),
      success: Contact.pipe(HttpApiSchema.status(201)),
    })
  ) {}
