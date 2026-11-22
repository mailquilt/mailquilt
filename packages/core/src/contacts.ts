import type {
  Contact,
  ContactAlreadyExists,
  ContactId,
  ContactPage,
} from "@repo/domain";
import { Context, Effect } from "effect";
import type { Option } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";

/** Port: the Contacts of the Organization a request acts in. */
export class Contacts extends Context.Service<
  Contacts,
  {
    /**
     * Creates a Contact. Fails if the Organization already has one whose
     * address differs from `email` at most in case.
     */
    readonly create: (
      email: string
    ) => Effect.Effect<Contact, ContactAlreadyExists, CurrentOrganization>;
    /** One page of Contacts, newest first, starting after the cursor `after`. */
    readonly page: (
      after: Option.Option<ContactId>
    ) => Effect.Effect<ContactPage, never, CurrentOrganization>;
  }
>()("@repo/core/Contacts") {}

/** Creates a Contact in the Organization this request acts in. */
export const createContact = (email: string) =>
  Effect.gen(function* createOrganizationContact() {
    const contacts = yield* Contacts;

    return yield* contacts.create(email);
  });

/** One page of the Organization's Contacts, newest first. */
export const listContacts = (after: Option.Option<ContactId>) =>
  Effect.gen(function* listOrganizationContacts() {
    const contacts = yield* Contacts;

    return yield* contacts.page(after);
  });
