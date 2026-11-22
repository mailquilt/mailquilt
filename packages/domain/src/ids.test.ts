import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { SecureRandom } from "effect/crypto";
import { TestClock } from "effect/testing";

import {
  encodeTypeId,
  newOrganizationId,
  OrganizationIdSchema,
} from "./ids.ts";

const isOrganizationId = Schema.is(OrganizationIdSchema);

describe("prefixed IDs", () => {
  it("encodes a UUID as the TypeID specification's valid-uuidv7 case", () => {
    const uuid = Uint8Array.from(
      "01890a5dac96774bbcceb302099a8057".match(/../gu) ?? [],
      (byte) => Number.parseInt(byte, 16)
    );

    assert.strictEqual(
      encodeTypeId("prefix", uuid),
      "prefix_01h455vb4pex5vsknk084sn02q"
    );
  });

  it.effect("sorts a later Organization ID after an earlier one", () =>
    Effect.gen(function* laterSortsAfter() {
      const earlier = yield* newOrganizationId;
      yield* TestClock.adjust("1 millis");
      const later = yield* newOrganizationId;

      assert.isTrue(isOrganizationId(earlier));
      assert.isTrue(isOrganizationId(later));
      assert.isTrue(earlier < later);
    }).pipe(Effect.provide(SecureRandom.layerWebCrypto))
  );

  it("accepts only the Organization prefix as an Organization ID", () => {
    assert.isTrue(isOrganizationId("org_01h455vb4pex5vsknk084sn02q"));
    assert.isFalse(isOrganizationId("mem_01h455vb4pex5vsknk084sn02q"));
    assert.isFalse(isOrganizationId("org_81h455vb4pex5vsknk084sn02q"));
  });
});
