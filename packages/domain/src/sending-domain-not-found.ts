import { Schema } from "effect";

/** The Sending Domain doesn't exist in this Organization. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SendingDomainNotFound extends Schema.TaggedError<SendingDomainNotFound>()(
  "SendingDomainNotFound",
  {}
) {}
