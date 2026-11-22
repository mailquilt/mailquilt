import { Data } from "effect";

/** The host resolves to an address this deployment doesn't connect to. */
export class OutboundBlocked extends Data.TaggedError("OutboundBlocked")<{
  readonly host: string;
}> {}
