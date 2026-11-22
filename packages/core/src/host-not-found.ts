import { Data } from "effect";

/** The host has no address, or isn't a valid host name. */
export class HostNotFound extends Data.TaggedError("HostNotFound")<{
  readonly host: string;
}> {}
