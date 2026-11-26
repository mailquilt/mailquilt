import { createHash } from "node:crypto";

import { assert, describe, it } from "@effect/vitest";

import { THEME_SCRIPT, THEME_SCRIPT_HASH } from "./shell.ts";

describe("public pages", () => {
  it("allow their theme script by the script's own hash, so the policy blocks any other", () => {
    assert.strictEqual(
      THEME_SCRIPT_HASH,
      `sha256-${createHash("sha256").update(THEME_SCRIPT).digest("base64")}`
    );
  });
});
