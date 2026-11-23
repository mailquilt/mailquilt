import { describe, expect, it } from "vitest";

import { wrappableAddress } from "./format.ts";

const shown = (address: string) =>
  wrappableAddress(address).replaceAll("​", "|");

describe(wrappableAddress, () => {
  it.each([
    ["ada@example.com", "ada@|example.com"],
    [
      "alexandra.konstantinopoulou@fastmail.com",
      "alexandra.|konstantinopoulou@|fastmail.com",
    ],
    [
      "orders@mail.thecornerpantry.co.uk",
      "orders@|mail.|thecornerpantry.|co.uk",
    ],
  ])(
    "lets %s break only after its @ or a dot, keeping the domain's ending whole",
    (address, expected) => {
      expect(shown(address)).toBe(expected);
    }
  );
});
