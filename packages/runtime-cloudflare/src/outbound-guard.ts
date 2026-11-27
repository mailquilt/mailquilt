import { promises as nodeDns } from "node:dns";

import { outboundGuardLayer } from "@repo/core";
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

/**
 * The outbound guard on Workers' `node:dns`. `BLOCK_PRIVATE_NETWORKS` (off
 * by default) also stops private networks and loopback, which Cloudflare's
 * network can't reach anyway outside `wrangler dev` (ADR 0010).
 */
export const OutboundGuardFromConfig = Layer.unwrap(
  Effect.gen(function* outboundGuardFromConfig() {
    return outboundGuardLayer({
      blockPrivateNetworks: yield* Config.Boolean(
        "BLOCK_PRIVATE_NETWORKS"
      ).pipe(Config.withDefault(false)),
    });
  })
).pipe(Layer.provide(AddressResolver.layer()), Layer.provide(WorkersDnsLive));
