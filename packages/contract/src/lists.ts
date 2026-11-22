import {
  AddedToList,
  ContactIdSchema,
  ContactNotFound,
  List,
  ListIdSchema,
  ListName,
  ListNotFound,
  MAX_CONTACTS_ADDED_AT_ONCE,
  OrganizationIdSchema,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { OrganizationNotFoundError, SignInRequiredError } from "./errors.ts";

const ListNotFoundError = ListNotFound.pipe(HttpApiSchema.status(404));

const params = { organizationId: OrganizationIdSchema };

const listParams = { ...params, listId: ListIdSchema };

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
      params,
      success: Schema.Array(List),
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/organizations/:organizationId/lists", {
      error: [SignInRequiredError, OrganizationNotFoundError],
      params,
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
          ContactNotFound.pipe(HttpApiSchema.status(404)),
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
