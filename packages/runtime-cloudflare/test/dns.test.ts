import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber, Layer, pipe, Ref } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";
import type { HttpClientRequest } from "effect/http";
import { Dns } from "effect/net";
import { TestClock } from "effect/testing";

import { dnsOverHttpsLayer, txtChunksOf } from "../src/dns.ts";

type Answer =
  | { readonly status: number; readonly body: unknown }
  | "unreachable"
  | "silent"
  | "stalls";

const resolverAnswering = (
  answer: Answer,
  requests?: Ref.Ref<readonly HttpClientRequest.HttpClientRequest[]>
) =>
  dnsOverHttpsLayer.pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.gen(function* answerLookup() {
            if (requests !== undefined) {
              yield* Ref.update(requests, (earlier) => [...earlier, request]);
            }

            if (answer === "silent") {
              return yield* Effect.never;
            }

            if (answer === "stalls") {
              return HttpClientResponse.fromWeb(
                request,
                new Response(new ReadableStream({ start: () => {} }), {
                  headers: { "content-type": "application/dns-json" },
                  status: 200,
                })
              );
            }

            if (answer === "unreachable") {
              return yield* new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({
                  cause: new Error("getaddrinfo ENOTFOUND cloudflare-dns.com"),
                  request,
                }),
              });
            }

            return HttpClientResponse.fromWeb(
              request,
              Response.json(answer.body, {
                headers: { "content-type": "application/dns-json" },
                status: answer.status,
              })
            );
          })
        )
      )
    )
  );

const resolve = <T extends "MX" | "TXT">(type: T) =>
  Effect.gen(function* resolveName() {
    const dns = yield* Dns.Dns;

    return yield* dns.resolve("acme.example", type);
  });

const reasonOf = (answer: Answer) =>
  resolve("TXT").pipe(
    Effect.flip,
    Effect.map((error) => error.reason),
    Effect.provide(resolverAnswering(answer))
  );

describe("a TXT record's strings from DNS-over-HTTPS's JSON", () => {
  it.each([
    ["one quoted string", '"v=spf1 -all"', ["v=spf1 -all"]],
    [
      "several quoted strings",
      '"v=DKIM1; p=MIGf" "MA0G"',
      ["v=DKIM1; p=MIGf", "MA0G"],
    ],
    ["escaped characters", String.raw`"say \"hi\"\059 \\"`, ['say "hi"; \\']],
    ["nothing quoted", "v=spf1 -all", ["v=spf1 -all"]],
  ] as const)("reads %s", (_, data, chunks) => {
    assert.deepStrictEqual(txtChunksOf(data), [...chunks]);
  });
});

describe("looking up DNS records over Cloudflare's DNS-over-HTTPS", () => {
  it.effect(
    "asks for the name and type as DNS JSON, and reads the answers of that type",
    () =>
      Effect.gen(function* answered() {
        const requests = yield* Ref.make<
          readonly HttpClientRequest.HttpClientRequest[]
        >([]);

        const records = yield* resolve("TXT").pipe(
          Effect.provide(
            resolverAnswering(
              {
                body: {
                  Answer: [
                    { data: "acme.example.cdn.example.", type: 5 },
                    { data: '"v=spf1 " "-all"', type: 16 },
                  ],
                  Status: 0,
                },
                status: 200,
              },
              requests
            )
          )
        );

        const [request] = yield* Ref.get(requests);

        assert.deepStrictEqual(
          records.map((record) => record.chunks),
          [["v=spf1 ", "-all"]]
        );
        assert.strictEqual(
          request?.url,
          "https://cloudflare-dns.com/dns-query"
        );
        assert.deepStrictEqual(request?.urlParams.params, [
          ["name", "acme.example"],
          ["type", "TXT"],
        ]);
        assert.strictEqual(request?.headers.accept, "application/dns-json");
      })
  );

  it.effect("reads MX records' hosts", () =>
    Effect.gen(function* mxAnswered() {
      const records = yield* resolve("MX").pipe(
        Effect.provide(
          resolverAnswering({
            body: {
              Answer: [{ data: "10 feedback-smtp.example.", type: 15 }],
              Status: 0,
            },
            status: 200,
          })
        )
      );

      assert.deepStrictEqual(
        records.map((record) => [record.priority, record.exchange]),
        [[10, "feedback-smtp.example."]]
      );
    })
  );

  it.effect("finds no records for a name that doesn't exist", () =>
    Effect.gen(function* noSuchName() {
      assert.strictEqual(
        yield* reasonOf({ body: { Status: 3 }, status: 200 }),
        "NotFound"
      );
    })
  );

  it.effect("fails when the resolver fails, refuses or can't be reached", () =>
    Effect.gen(function* resolverFails() {
      const reasons = yield* pipe(
        [
          { body: { Status: 2 }, status: 200 },
          { body: { Status: 5 }, status: 200 },
          { body: "Bad Gateway", status: 502 },
          { body: { Answer: "not a list" }, status: 200 },
          "unreachable",
        ] as const,
        Effect.forEach((answer) => reasonOf(answer))
      );

      assert.deepStrictEqual(reasons, [
        "ServerFailure",
        "Refused",
        "ServerFailure",
        "InvalidResponse",
        "Refused",
      ]);
    })
  );

  it.effect(
    "gives up on a lookup after 5 seconds, also when its answer stalls after its headers",
    () =>
      Effect.gen(function* silentResolver() {
        const silent = yield* reasonOf("silent").pipe(Effect.forkChild);
        const stalls = yield* reasonOf("stalls").pipe(Effect.forkChild);

        yield* TestClock.adjust("5 seconds");

        assert.deepStrictEqual(
          [yield* Fiber.join(silent), yield* Fiber.join(stalls)],
          ["Timeout", "Timeout"]
        );
      })
  );

  it.effect("leaves out an MX record whose host isn't a host name", () =>
    Effect.gen(function* badExchange() {
      const reason = yield* resolve("MX").pipe(
        Effect.flip,
        Effect.map((error) => error.reason),
        Effect.provide(
          resolverAnswering({
            body: { Answer: [{ data: "10 bad!host.", type: 15 }], Status: 0 },
            status: 200,
          })
        )
      );

      assert.strictEqual(reason, "NotFound");
    })
  );
});
