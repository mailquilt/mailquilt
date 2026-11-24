import { assert, describe, it } from "@effect/vitest";
import {
  Campaigns,
  ProviderConnections,
  SendCampaignBatch,
  SmtpProvider,
} from "@repo/core";
import { CampaignIdSchema, OrganizationIdSchema } from "@repo/domain";
import { Effect, Layer, Option, Schema } from "effect";

import { consumeQueueBatch } from "../src/queue.ts";

const BATCH = Schema.encodeSync(SendCampaignBatch)(
  new SendCampaignBatch({
    batch: 0,
    campaignId: CampaignIdSchema.make("cmp_01h455vb4pex5vsknk084sn02q"),
    organizationId: OrganizationIdSchema.make("org_01h455vb4pex5vsknk084sn02q"),
  })
);

const delivered = (body: Message["body"], attempts = 1) => {
  const settled: string[] = [];

  return {
    message: {
      ack: () => {
        settled.push("ack");
      },
      attempts,
      body,
      retry: (options?: QueueRetryOptions) => {
        settled.push(`retry after ${options?.delaySeconds ?? 0}s`);
      },
    },
    settled,
  };
};

const ports = (campaigns: Layer.Layer<Campaigns>) =>
  Layer.mergeAll(
    campaigns,
    Layer.mock(ProviderConnections, {}),
    Layer.mock(SmtpProvider, {})
  );

const CampaignGone = Layer.mock(Campaigns, {
  queuedBatch: () => Effect.succeed(Option.none()),
});

const DatabaseDown = Layer.mock(Campaigns, {
  queuedBatch: () => Effect.die(new Error("connection refused")),
});

describe("Cloudflare Queues consumer", () => {
  it.effect("acknowledges a message once its work is done", () =>
    Effect.gen(function* done() {
      const { message, settled } = delivered(BATCH);

      yield* consumeQueueBatch({ messages: [message] }).pipe(
        Effect.provide(ports(CampaignGone))
      );

      assert.deepStrictEqual(settled, ["ack"]);
    })
  );

  it.effect(
    "has a message whose work failed delivered again, waiting twice as long after each attempt",
    () =>
      Effect.gen(function* failed() {
        const first = delivered(BATCH, 1);
        const third = delivered(BATCH, 3);

        yield* consumeQueueBatch({
          messages: [first.message, third.message],
        }).pipe(Effect.provide(ports(DatabaseDown)));

        assert.deepStrictEqual(
          [...first.settled, ...third.settled],
          ["retry after 30s", "retry after 120s"]
        );
      })
  );

  it.effect(
    "drops a message that doesn't decode, rather than retrying it",
    () =>
      Effect.gen(function* undecodable() {
        const { message, settled } = delivered({ _tag: "NoSuchWork" });

        yield* consumeQueueBatch({ messages: [message] }).pipe(
          Effect.provide(ports(DatabaseDown))
        );

        assert.deepStrictEqual(settled, ["ack"]);
      })
  );
});
