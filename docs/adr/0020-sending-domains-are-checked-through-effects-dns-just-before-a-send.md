# Sending Domains are checked through Effect's `Dns` just before a send

Gmail and Yahoo reject bulk email from a domain that fails DKIM or has no DMARC record. A Campaign is sent only from an address at one of its Organization's Sending Domains whose DNS passes both, and a Sending Domain's DNS is looked up again just before each send (#31). This needs a DNS port that every runtime and the tests can provide, and a rule for when a lookup counts.

The port is Effect's own `Dns` service (`effect/net`), not one of ours. Checks read TXT and MX records through `Dns.resolve`. Each runtime provides it:

- **Workers:** Cloudflare's DNS-over-HTTPS resolver (`cloudflare-dns.com/dns-query`, JSON), through the platform's `fetch`, for TXT and MX only. Each lookup is one subrequest, and gives up after 5 seconds.
- **Node:** Effect's `NodeDns`, on the system's name servers, or those `DNS_SERVERS` lists, such as `1.1.1.1,8.8.8.8`. Each lookup waits up to 5 seconds a try, twice.
- **Tests:** a scripted zone (`ScriptedDnsLive`, `DnsZone` in `@repo/core/testing`) and Effect's static zone for the classification tests.
- **Development and the smoke test:** when `DEV_DNS_RECORDS` is set, both runtimes answer every lookup from it alone, and log a warning: on Node once at start, on Workers with each request, as their ports are built per request. The smoke test's `acme.example` has no real DNS.

Mailquilt doesn't sign email; the Provider does, under a DKIM selector only it knows. So a member enters the selectors their Provider gave them, such as SES's three tokens, and may enter the return path their Provider sends bounces to. A check looks up:

- **DKIM:** each selector's TXT at `<selector>._domainkey.<domain>`. Every selector must publish a key; one that's missing, empty (revoked) or not a DKIM key fails.
- **DMARC:** TXT at `_dmarc.<domain>`, then at each parent short of the top-level domain, at most 8 names (DMARCbis's tree walk, so no public suffix list). No record, several, or no valid `p` fails. A parent's subdomain policy (`sp`) applies to its subdomains. A policy of `none` only warns.
- **SPF:** TXT on the return path, or the domain itself without one. None, or more than one, only warns.
- **Return path:** whether it's the domain or under it (the domain itself only, under DMARC's strict `aspf`), and has MX records. Either missing only warns.

A failure blocks sending; a warning doesn't. A name with no records is a result. A lookup that fails, such as a timeout, fails the whole check, keeps nothing, and answers `DnsLookupFailed` (502).

Send now, Schedule and a scheduled Campaign's start each check its From address's domain first, keep what the check found, and go on only if it passed. A From domain that isn't a Sending Domain is refused (`SendingDomainRequired`), as is one that fails (`SendingDomainNotReady`), both 409. At a scheduled start, either makes the Campaign a draft again, saying why (`no-sending-domain`, `sending-domain-not-ready`); a lookup that fails there is retried by the queue, as a database that can't be reached is.

## Considered Options

- **Our own `DnsResolver` port:** a narrower interface, but it would wrap what Effect's `Dns` already gives: typed records, failure reasons that tell "no such name" from a timeout, a Node service with configurable name servers, and a static zone for tests.
- **`node:dns` on Workers:** workerd has it, but Effect's `NodeDns` fails every request there, as the outbound guard found (`packages/runtime-cloudflare/src/outbound-guard.ts`), and the ticket asked for DNS-over-HTTPS.
- **Mailquilt signs with its own DKIM key per domain:** the records shown would be exact for any relay, but SES would have to send raw MIME, and signing on Workers is unproven. The maintainer chose member-entered selectors.
- **The last stored check decides:** faster, but a record deleted since isn't noticed. The maintainer chose a fresh check each time.
- **Checking inside the transaction that starts the send:** no gap between the check and the send, but the transaction would hold its row lock and database connection through every DNS lookup, each of which may take seconds.

## Consequences

- The check runs before the transaction that starts or schedules the Campaign, so a From address changed in the moment between them isn't checked again. Only a draft's From can change, and only through an edit.
- The check comes before the other reasons a Campaign can't be sent, such as no Provider Connection or no one subscribed, so a draft with several problems is told about its domain first.
- A check makes up to 14 lookups with 5 selectors, a return path and a long domain, well inside Workers Free's 50 subrequests. They run one at a time: on the network this was built on, DNS queries sent at once over UDP were dropped, on Node's resolver in macOS and in a Linux container alike, and each waited out its timeout, so five took 11 to 20 seconds, against half a second one after another.
- Cloudflare's resolver caches answers for their TTL, and a name that didn't exist for the SOA's negative TTL, so a record just added can take that long to pass.
- Removing a Sending Domain stops Campaigns from it, including scheduled ones when they're due.
- `DEV_DNS_RECORDS` set in production would let any Campaign through whatever its DNS; the warning says so, and `compose.yaml` doesn't pass it on.
