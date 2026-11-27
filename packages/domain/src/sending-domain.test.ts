import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { DkimSelector } from "./sending-domain.ts";

const isSelector = Schema.is(DkimSelector);

describe("a DKIM selector", () => {
  it("takes several labels, each up to 63 characters", () => {
    assert.isTrue(isSelector(`${"a".repeat(32)}.${"b".repeat(32)}`));
  });

  it("refuses a label longer than 63 characters", () => {
    assert.isFalse(isSelector("a".repeat(64)));
  });
});
