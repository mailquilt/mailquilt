import type {
  Contact,
  ContactAlreadyExists,
  ContactId,
  ContactPage,
  ListId,
  ListNotFound,
  SubscriptionStatus,
} from "@repo/domain";
import { Context, Effect } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";

/** Which Contacts to list, and from where (ADR 0008). */
export interface ContactFilter {
  readonly after?: ContactId;
  readonly before?: ContactId;
  readonly list?: ListId;
  readonly status?: SubscriptionStatus;
}

/** Port: the Contacts of the Organization a request acts in. */
export class Contacts extends Context.Service<
  Contacts,
  {
    /**
     * Creates a Contact subscribed to `lists`. Fails, creating nothing, if
     * the Organization already has a Contact whose address differs from
     * `email` at most in case, or doesn't have one of the Lists.
     */
    readonly create: (
      email: string,
      lists: readonly ListId[]
    ) => Effect.Effect<
      Contact,
      ContactAlreadyExists | ListNotFound,
      CurrentOrganization
    >;
    /** One page of the Contacts `filter` matches, newest first. */
    readonly page: (
      filter: ContactFilter
    ) => Effect.Effect<ContactPage, ListNotFound, CurrentOrganization>;
  }
>()("@repo/core/Contacts") {}

/** Creates a Contact in the Organization this request acts in. */
export const createContact = (email: string, lists: readonly ListId[]) =>
  Effect.gen(function* createOrganizationContact() {
    const contacts = yield* Contacts;

    return yield* contacts.create(email, lists);
  });

/** One page of the Organization's Contacts, newest first. */
export const listContacts = (filter: ContactFilter) =>
  Effect.gen(function* listOrganizationContacts() {
    const contacts = yield* Contacts;

    return yield* contacts.page(filter);
  });
