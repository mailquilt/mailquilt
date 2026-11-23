import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { Checkbox } from "@cloudflare/kumo";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as icons from "./icons.tsx";

const PHOSPHOR_IMPORT =
  /import\s*\{(?<names>[^}]*)\}\s*from\s*"@phosphor-icons\/react"/gu;

const kumoIconNames = () => {
  const kumo = path.join(process.cwd(), "node_modules/@cloudflare/kumo/dist");
  const names = new Set<string>();
  const files = readdirSync(kumo, { recursive: true, encoding: "utf-8" });

  for (const file of files.filter((name) => name.endsWith(".js"))) {
    for (const { groups } of readFileSync(
      path.join(kumo, file),
      "utf-8"
    ).matchAll(PHOSPHOR_IMPORT)) {
      for (const part of (groups?.names ?? "").split(",")) {
        const [name] = part.trim().split(/\s+as\s+/u);

        if (name) {
          names.add(name);
        }
      }
    }
  }

  return [...names];
};

describe("Dashboard icons", () => {
  afterEach(cleanup);

  it("maps every icon Kumo draws, so a Kumo upgrade can't fall back to an icon we don't draw", () => {
    const needed = kumoIconNames();

    expect(needed.length).toBeGreaterThan(0);
    expect(needed.filter((name) => !(name in icons))).toStrictEqual([]);
  });

  it("draws Kumo's own icons from this module", () => {
    render(<Checkbox checked label="Subscribed" onCheckedChange={() => {}} />);

    const tick = screen
      .getByRole("checkbox", { name: "Subscribed" })
      .querySelector("svg");

    expect(tick?.getAttribute("viewBox")).toBe("0 0 24 24");
  });
});
