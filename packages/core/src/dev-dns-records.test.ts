import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { Dns } from "effect/net";

import { dnsWithDevRecords } from "./dev-dns-records.ts";

const LIVE = Dns.layerStatic({
  records: {
    "acme.example": [
      Dns.makeRecordUnsafe("TXT", { chunks: ["from the live resolver"] }),
    ],
  },
});

const txtWith = (env: Record<string, string>) =>
  Effect.gen(function* readTxt() {
    const dns = yield* Dns.Dns;

    return (yield* dns.resolve("acme.example", "TXT")).map((record) =>
      record.chunks.join("")
    );
  }).pipe(
    Effect.provide(
      dnsWithDevRecords(LIVE).pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))
      )
    )
  );

describe("DNS for development", () => {
  it.effect("is the runtime's resolver unless DEV_DNS_RECORDS is set", () =>
    Effect.gen(function* liveResolver() {
      assert.deepStrictEqual(yield* txtWith({}), ["from the live resolver"]);
    })
  );

  it.effect("answers only from DEV_DNS_RECORDS when it's set", () =>
    Effect.gen(function* devRecords() {
      const env = {
        DEV_DNS_RECORDS: JSON.stringify({
          "acme.example": { txt: ["v=spf1 -all"] },
          "bounce.acme.example": { mx: ["feedback-smtp.example"] },
        }),
      };

      const dns = yield* Effect.gen(function* readMx() {
        return yield* (yield* Dns.Dns).resolve("bounce.acme.example", "MX");
      }).pipe(
        Effect.provide(
          dnsWithDevRecords(LIVE).pipe(
            Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))
          )
        )
      );

      assert.deepStrictEqual(yield* txtWith(env), ["v=spf1 -all"]);
      assert.deepStrictEqual(
        dns.map((record) => record.exchange),
        ["feedback-smtp.example"]
      );
    })
  );
});
