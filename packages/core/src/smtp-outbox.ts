import type { SendFailed } from "@repo/domain";
import { Context, Effect, Layer, Option, Ref } from "effect";

import { SmtpProvider } from "./provider.ts";
import type { OutgoingEmail, SmtpSettings } from "./provider.ts";

/** One email the recording SMTP Provider was asked to send, with the settings it was given. */
export interface RecordedSend {
  readonly settings: SmtpSettings;
  readonly email: OutgoingEmail;
}

/** What the recording SMTP Provider was asked to send, and how to make its next send fail. */
export class SmtpOutbox extends Context.Service<
  SmtpOutbox,
  {
    readonly sent: Effect.Effect<readonly RecordedSend[]>;
    readonly failNextSend: (error: SendFailed) => Effect.Effect<void>;
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
    const nextFailure = yield* Ref.make(Option.none<SendFailed>());

    return Context.make(SmtpProvider, {
      parseNotifications: () => Effect.succeed([]),
      send: (settings, email) =>
        Effect.gen(function* send() {
          const failure = yield* Ref.getAndSet(nextFailure, Option.none());

          if (Option.isSome(failure)) {
            return yield* failure.value;
          }

          const all = yield* Ref.updateAndGet(sent, (sends) => [
            ...sends,
            { email, settings },
          ]);

          return { messageId: `<${all.length}@smtp.test>` };
        }),
    }).pipe(
      Context.add(SmtpOutbox, {
        failNextSend: (error) => Ref.set(nextFailure, Option.some(error)),
        sent: Ref.get(sent),
      })
    );
  })
);
