import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { CampaignHtml } from "./campaign-content.ts";

const fits = Schema.is(CampaignHtml);

const KIB = 1024;

describe("a Campaign's HTML", () => {
  it.each([
    [
      "fits when it fills 60 KiB as a JSON string",
      () => "a".repeat(60 * KIB - 2),
      true,
    ],
    ["doesn't fit one byte over", () => "a".repeat(60 * KIB - 1), false],
    [
      "counts three-byte characters as three bytes",
      () => "界".repeat(23_000),
      false,
    ],
    [
      "counts quotes as JSON escapes them, two bytes each",
      () => '"'.repeat(31 * KIB),
      false,
    ],
    ["can't be empty", () => "", false],
    [
      "counts four-byte characters, such as emoji, as four bytes",
      () => "😀".repeat(15_360),
      false,
    ],
  ])("%s", (_, html, expected) => {
    expect(fits(html())).toBe(expected);
  });
});
