import { Context, Effect, Layer, Predicate, Ref } from "effect";
import { Dns } from "effect/net";

type Answer = readonly Dns.DnsRecord[] | Dns.DnsErrorReason;

/** What the scripted resolver answers, set by tests. Names are compared lowercased, without a trailing dot. */
export class DnsZone extends Context.Service<
  DnsZone,
  {
    /** Answers every lookup of `name` with these records, replacing any before. */
    readonly set: (
      name: string,
      records: readonly Dns.DnsRecord[]
    ) => Effect.Effect<void>;
    /** Fails every lookup of `name` for this reason, such as `Timeout`. */
    readonly fail: (
      name: string,
      reason: Dns.DnsErrorReason
    ) => Effect.Effect<void>;
  }
>()("@repo/core/testing/DnsZone") {}

const keyOf = (name: string) => name.toLowerCase().replace(/\.$/u, "");

/** A TXT record of one or more strings. */
export const txtRecord = (...chunks: [string, ...string[]]) =>
  Dns.makeRecordUnsafe("TXT", { chunks });

/**
 * A `Dns` service answering from a zone tests script through `DnsZone`. A
 * name never set has no records.
 */
export const ScriptedDnsLive = Layer.effectContext(
  Effect.gen(function* scriptedDns() {
    const zone = yield* Ref.make(new Map<string, Answer>());

    const answer = (name: string) =>
      Ref.get(zone).pipe(Effect.map((answers) => answers.get(keyOf(name))));

    const put = (name: string, value: Answer) =>
      Ref.update(zone, (answers) => new Map(answers).set(keyOf(name), value));

    const dns = Dns.make({
      lookup: () => Effect.succeed([]),
      resolve: (name, type) =>
        Effect.flatMap(answer(name), (found) =>
          Predicate.isString(found)
            ? Effect.fail(
                new Dns.DnsError({
                  hostname: name,
                  method: "resolve",
                  reason: found,
                  recordType: type,
                })
              )
            : Effect.succeed(found ?? [])
        ),
    });

    return Context.make(Dns.Dns, dns).pipe(
      Context.add(DnsZone, {
        fail: (name, reason) => put(name, reason),
        set: (name, records) => put(name, records),
      })
    );
  })
);
