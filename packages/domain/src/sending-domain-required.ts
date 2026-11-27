import { Schema } from "effect";

/**
 * The Campaign's From address is at `domain`, which the Organization hasn't
 * added as a Sending Domain, so it can't be sent or scheduled.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SendingDomainRequired extends Schema.TaggedError<SendingDomainRequired>()(
  "SendingDomainRequired",
  { domain: Schema.String }
) {}
