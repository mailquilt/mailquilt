import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Breakable } from "./breakable.tsx";

const partsOf = (value: string) =>
  [...render(<Breakable value={value} />).container.children].map(
    (part) => part.textContent
  );

describe(Breakable, () => {
  afterEach(cleanup);

  it.each([
    [
      "no-reply@send.acme-corporation.co.uk",
      ["no-reply@", "send.", "acme-corporation.co.uk"],
    ],
    ["smtp.send.example.com.au:587", ["smtp.", "send.", "example.com.au:587"]],
    [
      "notifications@mail.acme-corporation.com",
      ["notifications@", "mail.", "acme-corporation.com"],
    ],
  ])("keeps the ending of %s with the name before it", (value, parts) => {
    expect(partsOf(value)).toStrictEqual(parts);
  });
});
