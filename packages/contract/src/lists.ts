import {
  ContactIdSchema,
  ContactNotFound,
  List,
  ListIdSchema,
  ListName,
  ListNotFound,
  OrganizationIdSchema,
  Subscription,
  SubscriptionIdSchema,
  SubscriptionPage,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { OrganizationNotFoundError, SignInRequiredError } from "./errors.ts";

const ListNotFoundError = ListNotFound.pipe(HttpApiSchema.status(404));

const params = { organizationId: OrganizationIdSchema };

const listParams = { ...params, listId: ListIdSchema };

/**
 * An Organization's Lists, and the Subscriptions of Contacts to them.
 * `subscribe` adds a Contact to a List as subscribed. A Contact already on
 * the List keeps its Subscription as it is, so it never subscribes again
 * someone who unsubscribed, and never skips a pending confirmation.
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
    HttpApiEndpoint.get(
      "subscriptions",
      "/organizations/:organizationId/lists/:listId/subscriptions",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          ListNotFoundError,
        ],
        params: listParams,
        /** `after` is the `next` cursor of the previous page (ADR 0008). */
        query: { after: Schema.optionalKey(SubscriptionIdSchema) },
        success: SubscriptionPage,
      }
    )
  )
  .add(
    HttpApiEndpoint.put(
      "subscribe",
      "/organizations/:organizationId/lists/:listId/subscriptions/:contactId",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          ListNotFoundError,
          ContactNotFound.pipe(HttpApiSchema.status(404)),
        ],
        params: { ...listParams, contactId: ContactIdSchema },
        success: Subscription,
      }
    )
  ) {}
