import { Schema } from "effect";

/** The Campaign's List has no Contact with a subscribed Subscription, so there's no one to send it to. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class NoSubscribedContacts extends Schema.TaggedError<NoSubscribedContacts>()(
  "NoSubscribedContacts",
  {}
) {}
