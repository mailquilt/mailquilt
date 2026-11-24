import { Queue } from "@repo/core";
import { Effect, Layer } from "effect";

/**
 * The Queue on Workers until Cloudflare Queues are wired in (#11): handing it
 * a message is a defect, so sending a Campaign answers 500 and, because the
 * message is queued inside the send's transaction, leaves it a draft.
 */
export const QueueUnavailable = Layer.succeed(Queue, {
  enqueue: () =>
    Effect.die(
      new Error(
        "Sending Campaigns doesn't work on Cloudflare yet. It works on the Docker image."
      )
    ),
});
