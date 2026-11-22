import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { AddressResolver, Dns, NetAddress } from "effect/net";

import {
  classifyAddress,
  OutboundGuard,
  outboundGuardLayer,
} from "./outbound-guard.ts";
import type { AddressClass } from "./outbound-guard.ts";

const ADDRESSES: readonly (readonly [string, AddressClass])[] = [
  ["93.184.215.14", "public"],
  ["8.8.8.8", "public"],
  ["2606:4700::1111", "public"],
  ["10.0.0.1", "private"],
  ["172.16.0.1", "private"],
  ["172.31.255.255", "private"],
  ["172.32.0.1", "public"],
  ["192.168.1.1", "private"],
  ["100.64.0.1", "private"],
  ["198.18.0.1", "private"],
  ["fd12:3456::1", "private"],
  ["127.0.0.1", "loopback"],
  ["127.255.255.254", "loopback"],
  ["::1", "loopback"],
  ["0.0.0.0", "loopback"],
  ["::", "loopback"],
  ["169.254.1.1", "link-local"],
  ["fe80::1", "link-local"],
  ["169.254.169.254", "metadata"],
  ["100.100.100.200", "metadata"],
  ["fd00:ec2::254", "metadata"],
  ["::ffff:10.0.0.1", "private"],
  ["::ffff:169.254.169.254", "metadata"],
  ["64:ff9b::a9fe:a9fe", "metadata"],
  ["64:ff9b::808:808", "public"],
  ["2002:a9fe:a9fe::", "metadata"],
  ["2002:0808:0808::", "public"],
  ["192.0.0.1", "reserved"],
  ["192.0.2.1", "reserved"],
  ["198.51.100.1", "reserved"],
  ["203.0.113.1", "reserved"],
  ["224.0.0.1", "reserved"],
  ["240.0.0.1", "reserved"],
  ["255.255.255.255", "reserved"],
  ["2001:db8::1", "reserved"],
  ["2001::1", "reserved"],
  ["ff02::1", "reserved"],
  ["fec0::1", "reserved"],
  ["100::1", "reserved"],
  ["3fff::1", "reserved"],
  ["4000::1", "reserved"],
];

describe("classifying an address an outbound request would connect to", () => {
  it.each(ADDRESSES)("classifies %s as %s", (address, expected) => {
    assert.strictEqual(
      classifyAddress(NetAddress.ipFromStringUnsafe(address)),
      expected
    );
  });
});

const HOSTS = {
  "mail.example.com": ["93.184.215.14"],
  "relay.internal": ["10.0.0.25"],
  "localhost.example.com": ["127.0.0.1"],
  "metadata.example.com": ["169.254.169.254"],
  "mixed.example.com": ["93.184.215.14", "10.0.0.25"],
};

const guardWith = (blockPrivateNetworks: boolean) =>
  outboundGuardLayer({ blockPrivateNetworks }).pipe(
    Layer.provide(AddressResolver.layer()),
    Layer.provide(Dns.layerStatic({ hosts: HOSTS }))
  );

const connectTo = (host: string) =>
  Effect.gen(function* connect() {
    const guard = yield* OutboundGuard;
    const address = yield* guard.check(host, 587);

    return NetAddress.formatInet(address);
  });

const refusal = (host: string) =>
  connectTo(host).pipe(
    Effect.flip,
    Effect.map((error) => error._tag)
  );

describe("the outbound guard on the hosted service", () => {
  it.effect("connects to the public address the host resolved to", () =>
    Effect.gen(function* publicHost() {
      assert.strictEqual(
        yield* connectTo("mail.example.com"),
        "93.184.215.14:587"
      );
    }).pipe(Effect.provide(guardWith(true)))
  );

  it.effect(
    "refuses a host that resolves to a private or loopback address",
    () =>
      Effect.gen(function* internalHosts() {
        assert.strictEqual(yield* refusal("relay.internal"), "OutboundBlocked");
        assert.strictEqual(
          yield* refusal("localhost.example.com"),
          "OutboundBlocked"
        );
        assert.strictEqual(yield* refusal("10.0.0.25"), "OutboundBlocked");
      }).pipe(Effect.provide(guardWith(true)))
  );

  it.effect("refuses a host when any address it resolves to is blocked", () =>
    Effect.gen(function* mixedHost() {
      assert.strictEqual(
        yield* refusal("mixed.example.com"),
        "OutboundBlocked"
      );
    }).pipe(Effect.provide(guardWith(true)))
  );

  it.effect("reports a host with no address as not found", () =>
    Effect.gen(function* unknownHost() {
      assert.strictEqual(yield* refusal("nowhere.example.com"), "HostNotFound");
    }).pipe(Effect.provide(guardWith(true)))
  );
});

describe("the outbound guard on a self-hosted install", () => {
  it.effect("connects to private networks and loopback by default", () =>
    Effect.gen(function* selfHosted() {
      assert.strictEqual(yield* connectTo("relay.internal"), "10.0.0.25:587");
      assert.strictEqual(
        yield* connectTo("localhost.example.com"),
        "127.0.0.1:587"
      );
    }).pipe(Effect.provide(guardWith(false)))
  );

  it.effect("still refuses cloud metadata and link-local addresses", () =>
    Effect.gen(function* metadata() {
      assert.strictEqual(
        yield* refusal("metadata.example.com"),
        "OutboundBlocked"
      );
      assert.strictEqual(yield* refusal("169.254.10.10"), "OutboundBlocked");
    }).pipe(Effect.provide(guardWith(false)))
  );
});
