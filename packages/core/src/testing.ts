import { Context, Effect, Layer, Ref } from "effect";

import { SystemMailer } from "./system-mailer.ts";
import type { SystemEmail } from "./system-mailer.ts";

/** Every email the fake System Mailer was asked to send, oldest first. */
export class SystemMailerOutbox extends Context.Service<
  SystemMailerOutbox,
  { readonly sent: Effect.Effect<readonly SystemEmail[]> }
>()("@repo/core/testing/SystemMailerOutbox") {}

/** A System Mailer that keeps each email in an outbox tests can read. */
export const SystemMailerOutboxLive = Layer.effectContext(
  Effect.gen(function* systemMailerOutbox() {
    const sent = yield* Ref.make<readonly SystemEmail[]>([]);

    return Context.make(SystemMailer, {
      send: (email) => Ref.update(sent, (emails) => [...emails, email]),
    }).pipe(Context.add(SystemMailerOutbox, { sent: Ref.get(sent) }));
  })
);

export { RecordingSmtpProviderLive, SmtpOutbox } from "./smtp-outbox.ts";

export type { RecordedSend } from "./smtp-outbox.ts";

export {
  RECORDING_SES_MAX_SEND_RATE,
  RecordingSesProviderLive,
  SesOutbox,
} from "./ses-outbox.ts";

export type { RecordedSesSend } from "./ses-outbox.ts";

export { InProcessQueueLive, QueueInbox } from "./in-process-queue.ts";

export { DnsZone, ScriptedDnsLive, txtRecord } from "./scripted-dns.ts";
