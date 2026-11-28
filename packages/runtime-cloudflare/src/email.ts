import { receiveBounce } from "@repo/core";
import type { BounceOutcome } from "@repo/core";
import { Effect } from "effect";

// WARNING: a bounce returns at most the email it's about, and a Campaign's HTML is at most 60 KiB, so 1 MiB leaves room for any genuine one; reading more would spend a Free Worker's memory on mail that can't be one.
const MAX_BOUNCE_BYTES = 1024 * 1024;

/** What became of an email the Worker was sent: what `receiveBounce` made of it, or too large to be a bounce. */
export type ReceivedEmailOutcome = BounceOutcome | "too-large";

const LOGGED: Record<ReceivedEmailOutcome, string> = {
  bounce: "Recorded a bounce sent to a bounce address",
  "not-a-bounce":
    "Ignored an email to a bounce address that isn't a failed delivery's report",
  "not-its-address":
    "Ignored a bounce about another address than its email went to, or about an email that has gone",
  "not-signed":
    "Ignored an email to an address this install didn't sign as a bounce address",
  "too-large": "Ignored an email to the bounce domain larger than any bounce",
};

/**
 * Handles one email Email Routing hands the Worker, which a catch-all rule
 * on `BOUNCE_DOMAIN` sends there (ADR 0021): reads it, at most 1 MiB, and
 * records it as a bounce if it is one. It's never answered with a
 * rejection: a bounce's sender is empty, so a rejection would reach no one.
 * It logs what became of it, never the address, which holds the token.
 */
export const receiveEmail = (
  message: Pick<ForwardableEmailMessage, "to" | "raw" | "rawSize">
) =>
  Effect.gen(function* receive() {
    if (message.rawSize > MAX_BOUNCE_BYTES) {
      return "too-large" satisfies ReceivedEmailOutcome;
    }

    const raw = yield* Effect.promise(() =>
      new Response(message.raw).arrayBuffer()
    );

    return yield* receiveBounce(message.to, new Uint8Array(raw));
  }).pipe(
    Effect.tap((outcome: ReceivedEmailOutcome) =>
      Effect.logInfo(LOGGED[outcome])
    )
  );
