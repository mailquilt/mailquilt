import type {
  ContactId,
  ContactNotFound,
  List,
  ListId,
  ListNotFound,
  Subscription,
  SubscriptionId,
  SubscriptionPage,
} from "@repo/domain";
import { Context, Effect } from "effect";
import type { Option } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";

/** Port: the Lists of the Organization a request acts in. */
export class Lists extends Context.Service<
  Lists,
  {
    /** Creates a List. */
    readonly create: (
      name: string
    ) => Effect.Effect<List, never, CurrentOrganization>;
    /** Every List, oldest first. */
    readonly all: Effect.Effect<readonly List[], never, CurrentOrganization>;
    /** One List. */
    readonly get: (
      id: ListId
    ) => Effect.Effect<List, ListNotFound, CurrentOrganization>;
    /**
     * Adds `contact` to the List as subscribed. If the Contact already has a
     * Subscription to it, that Subscription is returned unchanged.
     */
    readonly subscribe: (
      list: ListId,
      contact: ContactId
    ) => Effect.Effect<
      Subscription,
      ListNotFound | ContactNotFound,
      CurrentOrganization
    >;
    /** One page of the List's Subscriptions, newest first, after `after`. */
    readonly subscriptions: (
      list: ListId,
      after: Option.Option<SubscriptionId>
    ) => Effect.Effect<SubscriptionPage, ListNotFound, CurrentOrganization>;
  }
>()("@repo/core/Lists") {}

/** Creates a List in the Organization this request acts in. */
export const createList = (name: string) =>
  Effect.gen(function* createOrganizationList() {
    const lists = yield* Lists;

    return yield* lists.create(name);
  });

/** Every List in the Organization, oldest first. */
export const listLists = Effect.gen(function* listOrganizationLists() {
  const lists = yield* Lists;

  return yield* lists.all;
});

/** One List in the Organization. */
export const getList = (id: ListId) =>
  Effect.gen(function* getOrganizationList() {
    const lists = yield* Lists;

    return yield* lists.get(id);
  });

/**
 * Adds a Contact to a List as subscribed, keeping any Subscription it
 * already has to that List.
 */
export const addToList = (list: ListId, contact: ContactId) =>
  Effect.gen(function* addContactToList() {
    const lists = yield* Lists;

    return yield* lists.subscribe(list, contact);
  });

/** One page of a List's Subscriptions, newest first. */
export const listSubscriptions = (
  list: ListId,
  after: Option.Option<SubscriptionId>
) =>
  Effect.gen(function* listListSubscriptions() {
    const lists = yield* Lists;

    return yield* lists.subscriptions(list, after);
  });
