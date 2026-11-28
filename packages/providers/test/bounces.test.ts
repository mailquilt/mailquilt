import { assert, describe, it } from "@effect/vitest";
import { BounceReports } from "@repo/core";
import type { BounceKind } from "@repo/core";
import { Effect, Option } from "effect";

import { BounceReportsLive } from "../src/bounces.ts";
import {
  AUTO_REPLY,
  COMPLAINT_REPORT,
  deliveryStatusReport,
} from "./bounces.ts";

const read = (raw: string) =>
  Effect.gen(function* readReport() {
    const reports = yield* BounceReports;

    return yield* reports.read(new TextEncoder().encode(raw));
  }).pipe(Effect.provide(BounceReportsLive));

const CASES: readonly (readonly [string, string, Option.Option<BounceKind>])[] =
  [
    [
      "a permanent failure is a hard bounce",
      deliveryStatusReport({ action: "failed", status: "5.1.1" }),
      Option.some("hard-bounce"),
    ],
    [
      "a failure after transient errors is a soft bounce",
      deliveryStatusReport({ action: "failed", status: "4.4.7" }),
      Option.some("soft-bounce"),
    ],
    [
      "a full mailbox is a soft bounce, though its status is permanent",
      deliveryStatusReport({ action: "failed", status: "5.2.2" }),
      Option.some("soft-bounce"),
    ],
    [
      "a refusal by policy, such as a block on the sending server, is a soft bounce",
      deliveryStatusReport({ action: "failed", status: "5.7.1" }),
      Option.some("soft-bounce"),
    ],
    [
      "an internationalized report is read too",
      deliveryStatusReport(
        { action: "failed", status: "5.1.1" },
        { global: true }
      ),
      Option.some("hard-bounce"),
    ],
    [
      "a failure whose fields carry comments is still read",
      deliveryStatusReport({
        action: "failed",
        comments: true,
        status: "5.1.1",
      }),
      Option.some("hard-bounce"),
    ],
    [
      "a delay is no bounce",
      deliveryStatusReport({ action: "delayed", status: "4.4.7" }),
      Option.none(),
    ],
    [
      "a failure without a status says nothing to go on",
      deliveryStatusReport({ action: "failed", status: "unknown" }),
      Option.none(),
    ],
    ["an auto-reply is no bounce", AUTO_REPLY, Option.none()],
    [
      "a report that isn't about delivery status is no bounce",
      COMPLAINT_REPORT,
      Option.none(),
    ],
  ];

describe("delivery status reports", () => {
  it.effect(
    "names a failed delivery by the address the server tried, after an alias",
    () =>
      Effect.gen(function* aliasMember() {
        const failed = yield* read(
          deliveryStatusReport({
            action: "failed",
            originalRecipient: "team@example.com",
            recipient: "bob@example.com",
            status: "5.1.1",
          })
        );

        assert.deepStrictEqual(failed, [
          { kind: "hard-bounce", recipient: "bob@example.com" },
        ]);
      })
  );

  for (const [name, raw, expected] of CASES) {
    it.effect(name, () =>
      Effect.gen(function* classify() {
        assert.deepStrictEqual(
          yield* read(raw),
          Option.match(expected, {
            onNone: () => [],
            onSome: (kind) => [{ kind, recipient: "gone@example.com" }],
          })
        );
      })
    );
  }
});
