import { dnsWithDevRecords } from "@repo/core";
import { Duration, Effect, Layer, Result, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { Dns, Host } from "effect/net";

const DNS_OVER_HTTPS = "https://cloudflare-dns.com/dns-query";

const LOOKUP_TIMEOUT = Duration.seconds(5);

const RECORD_TYPE_NUMBERS = { MX: 15, TXT: 16 } as const;

const NO_ERROR = 0;
const SERVER_FAILURE = 2;
const NO_SUCH_NAME = 3;
const REFUSED = 5;

const QUOTED_STRING = /"(?<text>(?:[^"\\]|\\.)*)"/gu;

const ESCAPE = /\\(?<escaped>\d{3}|.)/gu;

const MX_DATA = /^(?<priority>\d+)\s+(?<exchange>\S+)$/u;

const DnsJson = Schema.Struct({
  Status: Schema.Number,
  Answer: Schema.optionalKey(
    Schema.Array(Schema.Struct({ type: Schema.Number, data: Schema.String }))
  ),
});

const decodeDnsJson = Schema.decodeUnknownEffect(DnsJson);

const unescape = (text: string) =>
  text.replaceAll(ESCAPE, (_, escaped: string) =>
    escaped.length === 3 ? String.fromCodePoint(Number(escaped)) : escaped
  );

/**
 * A TXT record's strings, from the presentation form DNS-over-HTTPS's JSON
 * gives, such as `"v=DKIM1; p=MIGf" "MA0G"`: each quoted string unescaped,
 * or the whole of it when nothing is quoted.
 */
export const txtChunksOf = (data: string) => {
  const [first, ...rest] = [...data.matchAll(QUOTED_STRING)].map((match) =>
    unescape(match.groups?.text ?? "")
  );

  return first === undefined
    ? ([data] as const)
    : ([first, ...rest] satisfies [string, ...string[]]);
};

const recordsOf = (type: "MX" | "TXT", data: string) => {
  const records: Dns.DnsRecord[] = [];

  if (type === "TXT") {
    records.push(Dns.makeRecordUnsafe("TXT", { chunks: txtChunksOf(data) }));
  }

  const mx = type === "MX" ? MX_DATA.exec(data.trim())?.groups : undefined;

  const exchange =
    mx?.exchange === undefined
      ? undefined
      : Result.getOrUndefined(Host.domainNameFromString(mx.exchange));

  if (mx?.priority !== undefined && exchange !== undefined) {
    records.push(
      Dns.makeRecordUnsafe("MX", { exchange, priority: Number(mx.priority) })
    );
  }

  return records;
};

const failure = (
  name: string,
  type: Dns.RecordType,
  reason: Dns.DnsErrorReason,
  cause?: unknown
) =>
  new Dns.DnsError({
    cause,
    hostname: name,
    method: "resolve",
    reason,
    recordType: type,
  });

const STATUS_FAILURES = new Map<number, Dns.DnsErrorReason>([
  [REFUSED, "Refused"],
  [SERVER_FAILURE, "ServerFailure"],
]);

/**
 * Effect's `Dns` over Cloudflare's DNS-over-HTTPS resolver, for TXT and MX
 * records, which is what Sending Domain checks read; anything else is
 * `Unsupported`. A name that doesn't exist has no records. Each lookup is
 * one `fetch`, so one subrequest, and gives up after 5 seconds.
 */
export const dnsOverHttpsLayer = Layer.effect(
  Dns.Dns,
  Effect.gen(function* dnsOverHttps() {
    const http = yield* HttpClient.HttpClient;

    const resolve = (name: Host.DomainName, type: Dns.RecordType) => {
      if (type !== "MX" && type !== "TXT") {
        return Effect.fail(failure(name, type, "Unsupported"));
      }

      return http
        .execute(
          HttpClientRequest.get(DNS_OVER_HTTPS).pipe(
            HttpClientRequest.setUrlParams({ name, type }),
            HttpClientRequest.setHeader("accept", "application/dns-json")
          )
        )
        .pipe(
          Effect.mapError((cause) => failure(name, type, "Refused", cause)),
          Effect.flatMap((response) =>
            response.status === 200
              ? response.json.pipe(
                  Effect.flatMap(decodeDnsJson),
                  Effect.mapError((cause) =>
                    failure(name, type, "InvalidResponse", cause)
                  )
                )
              : Effect.fail(failure(name, type, "ServerFailure"))
          ),
          // WARNING: the limit covers reading the answer too, not only its headers, so a resolver that stalls mid-answer still gives up.
          Effect.timeoutOrElse({
            duration: LOOKUP_TIMEOUT,
            orElse: () => Effect.fail(failure(name, type, "Timeout")),
          }),
          Effect.flatMap((answer) => {
            if (answer.Status === NO_SUCH_NAME) {
              return Effect.succeed<readonly Dns.DnsRecord[]>([]);
            }

            if (answer.Status !== NO_ERROR) {
              return Effect.fail(
                failure(
                  name,
                  type,
                  STATUS_FAILURES.get(answer.Status) ?? "Unknown"
                )
              );
            }

            return Effect.succeed(
              (answer.Answer ?? []).flatMap((record) =>
                record.type === RECORD_TYPE_NUMBERS[type]
                  ? recordsOf(type, record.data)
                  : []
              )
            );
          })
        );
    };

    return Dns.make({
      lookup: (host) =>
        Effect.fail(
          new Dns.DnsError({
            hostname: host,
            method: "lookup",
            reason: "Unsupported",
          })
        ),
      resolve,
    });
  })
);

/**
 * Sending Domain checks' DNS on Workers: Cloudflare's DNS-over-HTTPS
 * resolver through the platform's `fetch`, or `DEV_DNS_RECORDS` when set.
 */
export const DnsLive = dnsWithDevRecords(
  dnsOverHttpsLayer.pipe(Layer.provide(FetchHttpClient.layer))
);
