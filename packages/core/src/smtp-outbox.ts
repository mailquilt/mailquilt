import type { SendFailed } from "@repo/domain";
import { Context, DateTime, Effect, Layer, Option, Ref } from "effect";

import type { OutgoingEmail } from "./provider-port.ts";
import type { SendDeferred } from "./send-deferred.ts";
import { SmtpProvider } from "./smtp-provider.ts";
import type { SmtpSettings } from "./smtp-provider.ts";

/** One email the recording SMTP Provider was asked to send, with the settings it was given, and when by the `Clock`. */
export interface RecordedSend {
  readonly settings: SmtpSettings;
  readonly email: OutgoingEmail;
  readonly at: DateTime.Utc;
}

/**
 * What the recording SMTP Provider was asked to send, how to make its next
 * send fail, and something to do right after its next send, such as a
 * recipient unsubscribing while a batch is still sending.
 */
export class SmtpOutbox extends Context.Service<
  SmtpOutbox,
  {
    readonly sent: Effect.Effect<readonly RecordedSend[]>;
    readonly failNextSend: (
      error: SendFailed | SendDeferred
    ) => Effect.Effect<void>;
    readonly afterNextSend: (
      effect: Effect.Effect<void>
    ) => Effect.Effect<void>;
  }
>()("@repo/core/testing/SmtpOutbox") {}

/**
 * An SMTP Provider that sends nothing: it keeps each email, with the settings
 * and opened credentials it was given, in an outbox tests can read. Each
 * accepted email gets the next message ID, `<1@smtp.test>`, `<2@smtp.test>`…
 */
export const RecordingSmtpProviderLive = Layer.effectContext(
  Effect.gen(function* recordingSmtpProvider() {
    const sent = yield* Ref.make<readonly RecordedSend[]>([]);

    const nextFailure = yield* Ref.make(
      Option.none<SendFailed | SendDeferred>()
    );

    const afterNext = yield* Ref.make(Option.none<Effect.Effect<void>>());

    return Context.make(SmtpProvider, {
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

          const after = yield* Ref.getAndSet(afterNext, Option.none());

          if (Option.isSome(after)) {
            yield* after.value;
          }

          return { messageId: `<${all.length}@smtp.test>` };
        }),
    }).pipe(
      Context.add(SmtpOutbox, {
        afterNextSend: (effect) => Ref.set(afterNext, Option.some(effect)),
        failNextSend: (error) => Ref.set(nextFailure, Option.some(error)),
        sent: Ref.get(sent),
      })
    );
  })
);
