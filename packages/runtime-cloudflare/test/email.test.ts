import { assert, describe, it } from "@effect/vitest";
import {
  BounceDomain,
  BounceReports,
  DeliveryFeedback,
  SignedTokens,
} from "@repo/core";
import { Effect, Layer, Option } from "effect";

import { receiveEmail } from "../src/email.ts";

const ONE_MIB = 1024 * 1024;

const unread = () =>
  new ReadableStream<Uint8Array>({
    pull: () => {
      throw new Error("The email was read");
    },
  });

describe("Email Workers handler", () => {
  it.effect("ignores an email larger than any bounce, without reading it", () =>
    Effect.gen(function* tooLarge() {
      const outcome = yield* receiveEmail({
        raw: unread(),
        rawSize: ONE_MIB + 1,
        to: "anything@bounces.mail.example.com",
      });

      assert.strictEqual(outcome, "too-large");
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(BounceDomain, {
            domain: Option.some("bounces.mail.example.com"),
          }),
          Layer.mock(BounceReports, {}),
          Layer.mock(DeliveryFeedback, {}),
          Layer.mock(SignedTokens, {})
        )
      )
    )
  );
});
