import { promises as nodeDns } from "node:dns";

import { outboundGuardLayer, SmtpProvider } from "@repo/core";
import { SendFailed } from "@repo/domain";
import { smtpProviderLayer } from "@repo/providers/smtp";
import { Config, Effect, Layer } from "effect";
import { AddressResolver, Dns, NetAddress } from "effect/net";

const NO_SUCH_HOST = new Set(["ENOTFOUND", "ENODATA"]);

const FAMILY = { IPv4: 4, IPv6: 6 } as const;

const isNoSuchHost = (cause: unknown) =>
  cause instanceof Error &&
  "code" in cause &&
  NO_SUCH_HOST.has(String(cause.code));

// WARNING: Effect's NodeDns cancels a dns.Resolver when its scope closes, which workerd doesn't implement, so every request failed; the guard needs only `lookup`.
const WorkersDnsLive = Layer.succeed(
  Dns.Dns,
  Dns.make({
    lookup: (host, family) =>
      Effect.tryPromise({
        catch: (cause) =>
          new Dns.DnsError({
            cause,
            hostname: host,
            method: "lookup",
            reason: isNoSuchHost(cause) ? "NotFound" : "Unknown",
          }),
        try: () =>
          nodeDns.lookup(host, {
            all: true,
            family: family === undefined ? 0 : FAMILY[family],
          }),
      }).pipe(
        Effect.map((entries) =>
          entries.map((entry) => NetAddress.ipFromStringUnsafe(entry.address))
        )
      ),
  })
);

const OutboundGuardFromConfig = Layer.unwrap(
  Effect.gen(function* outboundGuardFromConfig() {
    return outboundGuardLayer({
      blockPrivateNetworks: yield* Config.Boolean(
        "BLOCK_PRIVATE_NETWORKS"
      ).pipe(Config.withDefault(false)),
    });
  })
).pipe(Layer.provide(AddressResolver.layer()), Layer.provide(WorkersDnsLive));

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
  parseNotifications: () => Effect.succeed([]),
  send: () =>
    Effect.fail(
      new SendFailed({
        detail:
          "Account emails can't be sent on Cloudflare yet. They can on the Docker image.",
        reason: "unavailable",
      })
    ),
});
