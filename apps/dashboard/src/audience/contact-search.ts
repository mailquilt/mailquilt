import {
  ContactIdSchema,
  ListIdSchema,
  SubscriptionStatusSchema,
} from "@repo/domain";
import { Schema } from "effect";
import type { Types } from "effect";

import { droppedIfInvalid, oneCursor } from "../search-in-url.ts";

const ContactSearchInUrl = Schema.Struct({
  after: Schema.optionalKey(droppedIfInvalid(ContactIdSchema)),
  before: Schema.optionalKey(droppedIfInvalid(ContactIdSchema)),
  list: Schema.optionalKey(droppedIfInvalid(ListIdSchema)),
  status: Schema.optionalKey(droppedIfInvalid(SubscriptionStatusSchema)),
});

/**
 * What the Contacts table shows, kept in the page's URL so a reload, the back
 * button or a shared link shows the same thing: the List it's filtered by, the
 * status on that List, and which page (ADR 0008). A part that doesn't parse,
 * such as an edited or out-of-date ID, is dropped rather than failing.
 */
export type ContactSearch = typeof ContactSearchInUrl.Type;

/** Reads the Contacts table's search from the URL. */
export const decodeContactSearch = Schema.decodeUnknownSync(ContactSearchInUrl);

/**
 * Keeps a search the API accepts: a status only with its List, and one
 * cursor, the forward one if both are given.
 */
export const consistentSearch = ({
  after,
  before,
  list,
  status,
}: ContactSearch) => {
  const search: Types.Mutable<ContactSearch> = {};

  if (list !== undefined) {
    search.list = list;

    if (status !== undefined) {
      search.status = status;
    }
  }

  return { ...search, ...oneCursor({ after, before }) } satisfies ContactSearch;
};
