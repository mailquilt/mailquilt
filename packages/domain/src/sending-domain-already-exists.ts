import { Schema } from "effect";

/** The Organization already has this domain as a Sending Domain. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SendingDomainAlreadyExists extends Schema.TaggedError<SendingDomainAlreadyExists>()(
  "SendingDomainAlreadyExists",
  {}
) {}
