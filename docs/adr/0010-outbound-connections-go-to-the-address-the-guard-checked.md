# Outbound connections go to the address the guard checked

Every connection to a host a customer chose, such as an SMTP server, first goes through the `OutboundGuard` port (`packages/core/src/outbound-guard.ts`). It resolves the host, classifies every address it gets (public, private, loopback, link-local, cloud metadata or reserved), refuses the host if any address is blocked, and returns the address to connect to. The caller then connects to that address, never to the host name again, so a second DNS answer can't send the connection somewhere else after the check (DNS rebinding). TLS still verifies the server's certificate against the host name, given as the TLS server name.

The policy has one switch, `blockPrivateNetworks`. With it on, only public addresses are allowed. With it off, private networks and loopback are allowed too, because an internal SMTP relay is normal on a self-hosted install. Cloud metadata (`169.254.169.254`, `100.100.100.200`, `fd00:ec2::254`), link-local and reserved addresses are refused either way, since nothing legitimate is sent there and the metadata service hands out the server's own cloud credentials. An IPv6 address that carries an IPv4 one (mapped, NAT64, 6to4) is classified by that IPv4 address. On Docker the switch is `BLOCK_PRIVATE_NETWORKS`, off by default; the hosted service turns it on (#38).

The guard is built on `effect/net`'s `AddressResolver` and `Dns`, so tests give it a static zone and each runtime gives it the platform's resolver.

On Workers, SMTP connects by the host name after the guard has checked it (#11). Cloudflare's `connect()` starts TLS only on a socket opened by name: one opened to the checked address closes right after STARTTLS, so on Workers the rule above would leave only unencrypted SMTP. The check still refuses a host that resolves to a blocked address, and Cloudflare resolves the name again when connecting. A second answer can't lead anywhere the check would refuse, because a deployed Worker reaches only the public internet (`wrangler dev` can reach the local network): from production, `connect()` to loopback, `10.0.0.1`, `172.16.0.1`, `192.168.1.1` and `169.254.169.254` fails, and there is no metadata service to reach.

## Considered Options

- **On Workers, keep connecting to the checked address and allow only unencrypted SMTP there:** keeps one rule everywhere, but credentials and email would cross the internet in plaintext, and most Providers refuse that.
- **Check the host, then let the client library resolve it again:** simpler, but the second lookup can return a private address after the first returned a public one.
- **Check at save time only:** DNS changes after the save, so the check has to run on every connection.
- **Block private networks on self-hosted installs too:** breaks the common case of a relay on the same network, so it is a setting instead.

## Consequences

- An adapter takes the guard as a requirement and connects to the address it returns, except on Workers, where it connects by name after the check. Outgoing webhooks, RSS fetches and image imports do the same when they arrive, and follow redirects only through the guard again.
- A host that resolves to several addresses connects to the first, without trying the others. The operating system's resolver usually sorts addresses this machine can't reach, such as IPv6 without IPv6 connectivity, last. If that proves wrong in practice, the adapter can try the next checked address when connecting fails.
- Hosts are checked on each send, not cached, so a lookup is part of every connection.
