import type {
  AddedToList,
  ContactId,
  ContactNotFound,
  List,
  ListId,
  ListNotFound,
} from "@repo/domain";
import { Context, Effect } from "effect";

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
     * Subscribes `contacts` to the List. Contacts that already have a
     * Subscription to it keep it unchanged. Fails, adding nobody, if the
     * Organization doesn't have the List or one of the Contacts.
     */
    readonly addContacts: (
      list: ListId,
      contacts: readonly ContactId[]
    ) => Effect.Effect<
      AddedToList,
      ListNotFound | ContactNotFound,
      CurrentOrganization
    >;
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
 * Subscribes Contacts to a List, keeping any Subscription they already have
 * to it.
 */
export const addToList = (list: ListId, contacts: readonly ContactId[]) =>
  Effect.gen(function* addContactsToList() {
    const lists = yield* Lists;

    return yield* lists.addContacts(list, contacts);
  });
