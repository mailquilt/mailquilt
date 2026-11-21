import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";

import { ApiClient, TestApp } from "./harness.ts";

layer(TestApp, { timeout: "2 minutes" })("health", (it) => {
  it.effect("reports the database as connected", () =>
    Effect.gen(function* health() {
      const client = yield* ApiClient;

      const status = yield* client.health();

      assert.strictEqual(status.database, "connected");
    })
  );
});
