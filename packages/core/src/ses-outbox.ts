import type { SendFailed } from "@repo/domain";
import { Context, DateTime, Effect, Layer, Option, Ref } from "effect";

import type { OutgoingEmail } from "./provider-port.ts";
import type { SendDeferred } from "./send-deferred.ts";
import { SesProvider } from "./ses-provider.ts";
import type { SesSettings } from "./ses-provider.ts";

/** One email the recording SES Provider was asked to send, with the settings it was given, and when by the `Clock`. */
export interface RecordedSesSend {
  readonly settings: SesSettings;
  readonly email: OutgoingEmail;
  readonly at: DateTime.Utc;
}

/** Until a test sets another, the sending limit the recording SES account reads as, in emails a second. */
export const RECORDING_SES_MAX_SEND_RATE = 14;

/**
 * What the recording SES Provider was asked to send, how to make its next
 * send fail, and what the account's sending limit reads as.
 */
export class SesOutbox extends Context.Service<
  SesOutbox,
  {
    readonly sent: Effect.Effect<readonly RecordedSesSend[]>;
    readonly failNextSend: (
      error: SendFailed | SendDeferred
    ) => Effect.Effect<void>;
    /** Sets the account's sending limit, in emails a second; `None` as when it can't be read. */
    readonly setMaxSendRate: (
      perSecond: Option.Option<number>
    ) => Effect.Effect<void>;
  }
>()("@repo/core/testing/SesOutbox") {}

/**
 * An SES Provider that sends nothing: it keeps each email, with the settings
 * and opened access key it was given, in an outbox tests can read. Each
 * accepted email gets the next message ID, `ses-1`, `ses-2`…
 */
export const RecordingSesProviderLive = Layer.effectContext(
  Effect.gen(function* recordingSesProvider() {
    const sent = yield* Ref.make<readonly RecordedSesSend[]>([]);

    const nextFailure = yield* Ref.make(
      Option.none<SendFailed | SendDeferred>()
    );

    const maxSendRate = yield* Ref.make(
      Option.some(RECORDING_SES_MAX_SEND_RATE)
    );

    return Context.make(SesProvider, {
      maxSendRate: () => Ref.get(maxSendRate),
      send: (settings, email) =>
        Effect.gen(function* send() {
          const failure = yield* Ref.getAndSet(nextFailure, Option.none());

          if (Option.isSome(failure)) {
            return yield* failure.value;
          }

          const at = yield* DateTime.now;

          const all = yield* Ref.updateAndGet(sent, (sends) => [
            ...sends,
            { at, email, settings },
          ]);

          return { messageId: `ses-${all.length}` };
        }),
    }).pipe(
      Context.add(SesOutbox, {
        failNextSend: (error) => Ref.set(nextFailure, Option.some(error)),
        sent: Ref.get(sent),
        setMaxSendRate: (perSecond) => Ref.set(maxSendRate, perSecond),
      })
    );
  })
);
