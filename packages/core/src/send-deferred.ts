import type { SendFailed } from "@repo/domain";
import { Data } from "effect";

/**
 * The Provider didn't take the email this time, and showed it hadn't, so it
 * can be tried again later without anyone getting it twice: the server
 * answered that it can't take it now (an SMTP 4xx reply), or no connection
 * to it opened. `failed` says what went wrong, for when it can't be tried
 * again. `everyEmail` says the Provider is putting off every email for now,
 * such as an account over its sending rate, so the rest of the batch waits
 * too, untried.
 */
export class SendDeferred extends Data.TaggedError("SendDeferred")<{
  readonly failed: SendFailed;
  readonly everyEmail?: boolean;
}> {}
