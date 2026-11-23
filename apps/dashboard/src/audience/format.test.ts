import { describe, expect, it } from "vitest";

import { WRAP_POINT, wrappableAddress } from "./format.ts";

const shown = (address: string) =>
  wrappableAddress(address).replaceAll(WRAP_POINT, "|");

describe(wrappableAddress, () => {
  it.each([
    ["ada@example.com", "ada@|example.com"],
    ["ada@localhost", "ada@|localhost"],
  ])(
    "lets %s break only after its @ or a dot, keeping the domain's ending whole",
    (address, expected) => {
      expect(shown(address)).toBe(expected);
    }
  );
});
