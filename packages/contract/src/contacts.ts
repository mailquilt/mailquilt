import {
  Contact,
  ContactEmail,
  ContactIdSchema,
  ContactPage,
  ListIdSchema,
  SubscriptionStatusSchema,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import {
  ContactAlreadyExistsError,
  ListNotFoundError,
  OrganizationNotFoundError,
  SignInRequiredError,
} from "./errors.ts";
import { organizationParams } from "./params.ts";

const MAX_LISTS_FOR_NEW_CONTACT = 100;

/**
 * Which Contacts to list. `after` and `before` are the `next` and `previous`
 * cursors of another page (ADR 0008). `list` keeps the Contacts with a
 * Subscription to that List, and `status` only those whose Subscription to it
 * has that status, so it needs `list`.
 */
export const ContactQuery = Schema.Struct({
  after: Schema.optionalKey(ContactIdSchema),
  before: Schema.optionalKey(ContactIdSchema),
  list: Schema.optionalKey(ListIdSchema),
  status: Schema.optionalKey(SubscriptionStatusSchema),
}).check(
  Schema.makeFilter(
    (query) => query.status === undefined || query.list !== undefined,
    { message: "Choose a list to filter by status." }
  ),
  Schema.makeFilter(
    (query) => query.after === undefined || query.before === undefined,
    { message: "Ask for the page after one cursor or before it, not both." }
  )
);

/** An Organization's Contacts. */
export class ContactsApi extends HttpApiGroup.make("contacts")
  .add(
    HttpApiEndpoint.get("list", "/organizations/:organizationId/contacts", {
      error: [
        SignInRequiredError,
        OrganizationNotFoundError,
        ListNotFoundError,
      ],
      params: organizationParams,
      query: ContactQuery,
      success: ContactPage,
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/organizations/:organizationId/contacts", {
      error: [
        SignInRequiredError,
        OrganizationNotFoundError,
        ContactAlreadyExistsError,
        ListNotFoundError,
      ],
      params: organizationParams,
      payload: Schema.Struct({
        email: ContactEmail,
        listIds: Schema.optionalKey(
          Schema.Array(ListIdSchema).check(
            Schema.isMaxLength(MAX_LISTS_FOR_NEW_CONTACT)
          )
        ),
      }),
      success: Contact.pipe(HttpApiSchema.status(201)),
    })
  ) {}
