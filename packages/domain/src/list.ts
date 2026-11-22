import { Schema } from "effect";

import { Count } from "./count.ts";
import { ListIdSchema } from "./ids.ts";

const MAX_NAME_LENGTH = 100;

/** What a List is called. Spaces around it are trimmed. */
export const ListName = Schema.Trim.check(
  Schema.isNonEmpty({ message: "Enter a name for the list." }),
  Schema.isMaxLength(MAX_NAME_LENGTH, {
    message: `Use at most ${MAX_NAME_LENGTH} characters.`,
  })
);

/**
 * A named group of Contacts, representing what they agreed to receive, with
 * how many of its Subscriptions have each status.
 */
export class List extends Schema.Class<List>("List")({
  id: ListIdSchema,
  name: ListName,
  createdAt: Schema.DateTimeUtc,
  subscriptions: Schema.Struct({
    subscribed: Count,
    pending: Count,
    unsubscribed: Count,
  }),
}) {}
