import {
  AddedToList,
  ContactIdSchema,
  List,
  ListIdSchema,
  ListName,
  MAX_CONTACTS_ADDED_AT_ONCE,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import {
  ContactNotFoundError,
  ListNotFoundError,
  OrganizationNotFoundError,
  SignInRequiredError,
} from "./errors.ts";
import { organizationParams } from "./params.ts";

const listParams = { ...organizationParams, listId: ListIdSchema };

/**
 * An Organization's Lists. `addContacts` subscribes Contacts to a List. A
 * Contact already on the List keeps its Subscription as it is, so it never
 * subscribes again someone who unsubscribed, and never skips a pending
 * confirmation. If any Contact doesn't exist, nobody is added.
 */
export class ListsApi extends HttpApiGroup.make("lists")
  .add(
    HttpApiEndpoint.get("list", "/organizations/:organizationId/lists", {
      error: [SignInRequiredError, OrganizationNotFoundError],
      params: organizationParams,
      success: Schema.Array(List),
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/organizations/:organizationId/lists", {
      error: [SignInRequiredError, OrganizationNotFoundError],
      params: organizationParams,
      payload: Schema.Struct({ name: ListName }),
      success: List.pipe(HttpApiSchema.status(201)),
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/organizations/:organizationId/lists/:listId", {
      error: [
        SignInRequiredError,
        OrganizationNotFoundError,
        ListNotFoundError,
      ],
      params: listParams,
      success: List,
    })
  )
  .add(
    HttpApiEndpoint.post(
      "addContacts",
      "/organizations/:organizationId/lists/:listId/subscriptions",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          ListNotFoundError,
          ContactNotFoundError,
        ],
        params: listParams,
        payload: Schema.Struct({
          contactIds: Schema.NonEmptyArray(ContactIdSchema).check(
            Schema.isMaxLength(MAX_CONTACTS_ADDED_AT_ONCE)
          ),
        }),
        success: AddedToList,
      }
    )
  ) {}
