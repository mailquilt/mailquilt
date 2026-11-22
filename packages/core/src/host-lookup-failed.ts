import { Data } from "effect";

/**
 * Looking the host up failed, such as a DNS timeout or a server failure, so
 * whether it has an address is unknown. `detail` is the resolver's reason.
 */
export class HostLookupFailed extends Data.TaggedError("HostLookupFailed")<{
  readonly host: string;
  readonly detail: string;
}> {}
