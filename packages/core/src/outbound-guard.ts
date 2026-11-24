import { Array as Arr, Context, Effect, Layer, Option } from "effect";
import type { Dns } from "effect/net";
import { AddressResolver, IpNetwork, NetAddress } from "effect/net";

import { HostLookupFailed } from "./host-lookup-failed.ts";
import { HostNotFound } from "./host-not-found.ts";
import { OutboundBlocked } from "./outbound-blocked.ts";

/**
 * What kind of network an address belongs to, as the outbound guard sees it.
 * `metadata` is a cloud provider's instance metadata service, which hands out
 * the server's own credentials. `reserved` is everything else that isn't
 * public: documentation, multicast, broadcast and unassigned ranges.
 */
export type AddressClass =
  | "public"
  | "private"
  | "loopback"
  | "link-local"
  | "metadata"
  | "reserved";

const networks = (cidrs: readonly string[]) =>
  cidrs.map((cidr) => IpNetwork.fromStringUnsafe(cidr));

// WARNING: checked in order, so each range must come before any wider range that contains it.
const RANGES: readonly (readonly [
  AddressClass,
  readonly IpNetwork.IpNetwork[],
])[] = [
  [
    "metadata",
    networks(["169.254.169.254/32", "100.100.100.200/32", "fd00:ec2::254/128"]),
  ],
  ["loopback", networks(["0.0.0.0/8", "127.0.0.0/8", "::/128", "::1/128"])],
  ["link-local", networks(["169.254.0.0/16", "fe80::/10"])],
  [
    "private",
    networks([
      "10.0.0.0/8",
      "100.64.0.0/10",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "198.18.0.0/15",
      "fc00::/7",
    ]),
  ],
  [
    "reserved",
    networks([
      "192.0.0.0/24",
      "192.0.2.0/24",
      "198.51.100.0/24",
      "203.0.113.0/24",
      "224.0.0.0/3",
      "2001::/23",
      "2001:db8::/32",
      "3fff::/20",
    ]),
  ],
];

const GLOBAL_UNICAST_V6 = IpNetwork.fromStringUnsafe("2000::/3");

const NAT64 = IpNetwork.fromStringUnsafe("64:ff9b::/96");

const SIX_TO_FOUR = IpNetwork.fromStringUnsafe("2002::/16");

const ipv4From = (octets: readonly number[]) =>
  NetAddress.ipv4FromBytesUnsafe(Uint8Array.from(octets));

const NAT64_IPV4_START = 12;

const SIX_TO_FOUR_IPV4_START = 2;

const IPV4_LENGTH = 4;

const embeddedIpv4 = (address: NetAddress.IpAddress) => {
  if (!NetAddress.isIpv6Address(address)) {
    return Option.none();
  }

  const mapped = NetAddress.fromIpv4Mapped(address);

  if (Option.isSome(mapped)) {
    return mapped;
  }

  const octets = NetAddress.ipv6ToOctets(address);

  if (IpNetwork.contains(NAT64, address)) {
    return Option.some(
      ipv4From(octets.slice(NAT64_IPV4_START, NAT64_IPV4_START + IPV4_LENGTH))
    );
  }

  if (IpNetwork.contains(SIX_TO_FOUR, address)) {
    return Option.some(
      ipv4From(
        octets.slice(
          SIX_TO_FOUR_IPV4_START,
          SIX_TO_FOUR_IPV4_START + IPV4_LENGTH
        )
      )
    );
  }

  return Option.none();
};

/**
 * Classifies an address by the network it belongs to. An IPv6 address that
 * carries an IPv4 one (mapped, NAT64 or 6to4) is classified by that IPv4
 * address, since that is where a connection to it ends up.
 */
export const classifyAddress = (address: NetAddress.IpAddress) => {
  const target = Option.getOrElse(embeddedIpv4(address), () => address);

  for (const [kind, ranges] of RANGES) {
    if (ranges.some((range) => IpNetwork.contains(range, target))) {
      return kind;
    }
  }

  const kind: AddressClass =
    NetAddress.isIpv6Address(target) &&
    !IpNetwork.contains(GLOBAL_UNICAST_V6, target)
      ? "reserved"
      : "public";

  return kind;
};

/**
 * Port: checks where an outbound connection to a host chosen by a customer,
 * such as an SMTP server, would go. It resolves the host and returns the
 * address to connect to. Callers connect to that address, never to the host
 * name again, so a second DNS answer can't point the connection somewhere
 * else after the check (ADR 0010). SMTP on Workers is the exception: it
 * connects by name after the check, because Cloudflare starts TLS only on a
 * socket opened by name and reaches only the public internet.
 */
export class OutboundGuard extends Context.Service<
  OutboundGuard,
  {
    readonly check: (
      host: string,
      port: number
    ) => Effect.Effect<
      NetAddress.InetAddress,
      OutboundBlocked | HostNotFound | HostLookupFailed
    >;
  }
>()("@repo/core/OutboundGuard") {}

const ALWAYS_BLOCKED: ReadonlySet<AddressClass> = new Set([
  "link-local",
  "metadata",
  "reserved",
]);

const NO_SUCH_HOST: ReadonlySet<Dns.DnsErrorReason> = new Set([
  "NotFound",
  "BadName",
]);

const lookupError = (
  host: string,
  error: Dns.DnsError | NetAddress.NetAddressError
) =>
  error._tag === "DnsError" && !NO_SUCH_HOST.has(error.reason)
    ? new HostLookupFailed({ detail: error.message, host })
    : new HostNotFound({ host });

/**
 * The outbound guard. With `blockPrivateNetworks`, as on the hosted service,
 * it connects only to public addresses. Without it, as on a self-hosted
 * install by default, private networks and loopback are allowed too, since
 * internal SMTP relays are normal there. Cloud metadata, link-local and
 * reserved addresses are always refused. A host is refused if any of its
 * addresses is.
 */
export const outboundGuardLayer = (policy: {
  readonly blockPrivateNetworks: boolean;
}) => {
  const isBlocked = (address: NetAddress.InetAddress) => {
    const kind = classifyAddress(address.address);

    return policy.blockPrivateNetworks
      ? kind !== "public"
      : ALWAYS_BLOCKED.has(kind);
  };

  return Layer.effect(
    OutboundGuard,
    Effect.gen(function* outboundGuard() {
      const resolver = yield* AddressResolver.AddressResolver;

      return {
        check: (host, port) =>
          Effect.gen(function* check() {
            const addresses = yield* resolver
              .resolve({ host, port })
              .pipe(Effect.mapError((error) => lookupError(host, error)));

            if (addresses.some((address) => isBlocked(address))) {
              return yield* new OutboundBlocked({ host });
            }

            return Arr.headNonEmpty(addresses);
          }),
      };
    })
  );
};
