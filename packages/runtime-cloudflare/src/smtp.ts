import { SmtpProvider } from "@repo/core";
import { SendFailed } from "@repo/domain";
import { smtpProviderLayer } from "@repo/providers/smtp";
import { Effect, Layer } from "effect";

import { OutboundGuardFromConfig } from "./outbound-guard.ts";

/**
 * Sends through SMTP servers with the same Nodemailer adapter as Node, over
 * Workers' `node:net` and `node:tls`, which run on `connect()`. Hosts are
 * looked up with Workers' `node:dns` and checked by the outbound guard, then
 * connected to by name (ADR 0010). `BLOCK_PRIVATE_NETWORKS` (off by default) also stops private
 * networks and loopback, which Cloudflare's network can't reach anyway
 * outside `wrangler dev`.
 */
export const SmtpProviderLive = smtpProviderLayer({
  // WARNING: Cloudflare's connect() starts TLS only on a socket opened by host name; one opened to the checked IP closes right after STARTTLS (ADR 0010).
  connectByHostName: true,
}).pipe(Layer.provide(OutboundGuardFromConfig));

/**
 * SMTP for the System Mailer on Workers: sending fails at once. A Worker's
 * connections close with its response, so an account email would be sent
 * before sign-up answers, and how long it took would reveal whether the
 * address already has an account.
 */
export const SmtpProviderUnavailable = Layer.succeed(SmtpProvider, {
  send: () =>
    Effect.fail(
      new SendFailed({
        detail:
          "Account emails can't be sent on Cloudflare yet. They can on the Docker image.",
        reason: "unavailable",
      })
    ),
});
