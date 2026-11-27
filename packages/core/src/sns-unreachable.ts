import { Data } from "effect";

/**
 * SNS couldn't be reached to fetch its signing certificate or confirm a
 * subscription. SNS delivers the message again later.
 */
export class SnsUnreachable extends Data.TaggedError("SnsUnreachable")<{
  readonly detail: string;
}> {}
