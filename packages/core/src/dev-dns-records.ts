import { Config, Effect, Layer, Option, Schema } from "effect";
import { Dns, Host } from "effect/net";

const DEV_DNS_RECORDS = "DEV_DNS_RECORDS";

const MX_PRIORITY = 10;

const DevDnsRecords = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Struct({
      txt: Schema.optionalKey(Schema.Array(Schema.String)),
      mx: Schema.optionalKey(Schema.Array(Schema.String)),
    })
  )
);

const zoneOf = (records: typeof DevDnsRecords.Type) =>
  Object.fromEntries(
    Object.entries(records).map(([name, { mx = [], txt = [] }]) => [
      name,
      [
        ...txt.map((text) => Dns.makeRecordUnsafe("TXT", { chunks: [text] })),
        ...mx.map((exchange) =>
          Dns.makeRecordUnsafe("MX", {
            exchange: Host.domainNameFromStringUnsafe(exchange),
            priority: MX_PRIORITY,
          })
        ),
      ],
    ])
  );

/**
 * The runtime's `Dns`, unless `DEV_DNS_RECORDS` is set: then every lookup
 * is answered from it alone, as JSON such as
 * `{"_dmarc.acme.example": {"txt": ["v=DMARC1; p=reject"]}}`, and a warning
 * is logged each time this layer is built. It's for development and the smoke test,
 * whose domains have no real DNS, never for production.
 */
export const dnsWithDevRecords = <E, R>(live: Layer.Layer<Dns.Dns, E, R>) =>
  Layer.unwrap(
    Effect.gen(function* dnsFromConfig() {
      const records = yield* Config.option(
        Config.schema(DevDnsRecords, DEV_DNS_RECORDS)
      );

      if (Option.isNone(records)) {
        return live;
      }

      yield* Effect.logWarning(
        `${DEV_DNS_RECORDS} is set, so Sending Domains are checked against it, not real DNS. Never set it in production.`
      );

      return Dns.layerStatic({ records: zoneOf(records.value) }).pipe(
        Layer.orDie
      );
    })
  );
