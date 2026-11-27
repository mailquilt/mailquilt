import { Data } from "effect";

/**
 * A request that isn't an SNS message SNS signed: unreadable, with a
 * signature that doesn't match, a signing certificate or subscription URL
 * that isn't SNS's own, or older than SNS ever delivers one. `detail` says
 * which, for the log.
 */
export class InvalidSnsMessage extends Data.TaggedError("InvalidSnsMessage")<{
  readonly detail: string;
}> {}
