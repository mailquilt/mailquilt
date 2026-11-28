import { Context, Effect, Layer, Ref } from "effect";

import { CloudflareEmailProvider } from "./cloudflare-email-provider.ts";
import type { CloudflareEmailSettings } from "./cloudflare-email-provider.ts";
import type { OutgoingEmail } from "./provider-port.ts";

/** One email the recording Cloudflare Email Provider was asked to send, with the settings it was given. */
export interface RecordedCloudflareSend {
  readonly settings: CloudflareEmailSettings;
  readonly email: OutgoingEmail;
}

/** What the recording Cloudflare Email Provider was asked to send. */
export class CloudflareEmailOutbox extends Context.Service<
  CloudflareEmailOutbox,
  {
    readonly sent: Effect.Effect<readonly RecordedCloudflareSend[]>;
  }
>()("@repo/core/testing/CloudflareEmailOutbox") {}

/**
 * A Cloudflare Email Provider that sends nothing: it keeps each email, with
 * the settings and opened API token it was given, in an outbox tests can
 * read. Each accepted email gets the next message ID, `cloudflare-1`,
 * `cloudflare-2`…
 */
export const RecordingCloudflareEmailProviderLive = Layer.effectContext(
  Effect.gen(function* recordingCloudflareEmailProvider() {
    const sent = yield* Ref.make<readonly RecordedCloudflareSend[]>([]);

    return Context.make(CloudflareEmailProvider, {
      send: (settings, email) =>
        Effect.gen(function* send() {
          const all = yield* Ref.updateAndGet(sent, (sends) => [
            ...sends,
            { email, settings },
          ]);

          return { messageId: `cloudflare-${all.length}` };
        }),
    }).pipe(Context.add(CloudflareEmailOutbox, { sent: Ref.get(sent) }));
  })
);
