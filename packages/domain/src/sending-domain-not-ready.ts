import { Schema } from "effect";

import { SendingDomainIdSchema } from "./ids.ts";

/**
 * The Campaign's Sending Domain failed DKIM or has no valid DMARC record
 * when it was checked just now, so it can't be sent or scheduled. The
 * Sending Domain's `check` says what failed.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SendingDomainNotReady extends Schema.TaggedError<SendingDomainNotReady>()(
  "SendingDomainNotReady",
  { sendingDomainId: SendingDomainIdSchema, domain: Schema.String }
) {}
