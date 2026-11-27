import { NodeAddressResolver, NodeDns } from "@effect/platform-node";
import { outboundGuardLayer } from "@repo/core";
import { Config, Effect, Layer } from "effect";

/**
 * The outbound guard on the system's resolver. `BLOCK_PRIVATE_NETWORKS`
 * (off by default) stops connections to private networks and loopback too,
 * for an install that shouldn't reach its own network (ADR 0010).
 */
export const OutboundGuardFromEnv = Layer.unwrap(
  Effect.gen(function* outboundGuardFromEnv() {
    return outboundGuardLayer({
      blockPrivateNetworks: yield* Config.Boolean(
        "BLOCK_PRIVATE_NETWORKS"
      ).pipe(Config.withDefault(false)),
    });
  })
).pipe(Layer.provide(NodeAddressResolver.layer), Layer.provide(NodeDns.layer));
