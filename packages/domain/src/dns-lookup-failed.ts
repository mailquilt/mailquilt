import { Schema } from "effect";

/**
 * Looking up `name` in DNS failed, such as a timeout or a server failure,
 * so the Sending Domain couldn't be checked. `detail` says why. Nothing was
 * stored, and trying again may work.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class DnsLookupFailed extends Schema.TaggedError<DnsLookupFailed>()(
  "DnsLookupFailed",
  { name: Schema.String, detail: Schema.String }
) {}
