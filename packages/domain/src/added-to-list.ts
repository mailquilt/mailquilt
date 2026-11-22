import { Schema } from "effect";

import { Count } from "./count.ts";

/** The most Contacts one request can add to a List: one page of them. */
export const MAX_CONTACTS_ADDED_AT_ONCE = 50;

/**
 * What adding Contacts to a List did. Only Contacts without a Subscription to
 * it were added; the others were left as they were, so nobody who unsubscribed
 * is subscribed again and nobody pending skips confirmation.
 */
export class AddedToList extends Schema.Class<AddedToList>("AddedToList")({
  added: Count,
  alreadySubscribed: Count,
  leftPending: Count,
  leftUnsubscribed: Count,
}) {}
