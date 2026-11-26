import { describe, expect, it } from "vitest";

import { addressesInCsv } from "./csv-addresses.ts";

describe(addressesInCsv, () => {
  it("takes the column headed email, each address once whatever its case, and skips rows that aren't addresses", () => {
    const found = addressesInCsv(
      [
        "Name,Email,Unsubscribed on",
        "Ada,ada@example.com,2025-03-02",
        "Jane,jane at example dot com,2025-04-17",
        "Ada again,ADA@example.com,2025-05-01",
        "Nobody,,2025-06-09",
        "",
        "Grace, grace@example.com ,2025-06-30",
      ].join("\n")
    );

    expect(found.columns).toStrictEqual(["Name", "Email", "Unsubscribed on"]);
    expect(found.column).toBe(1);
    expect(found.addresses).toStrictEqual([
      "ada@example.com",
      "grace@example.com",
    ]);
    expect(found.skipped).toStrictEqual([
      { row: 3, value: "jane at example dot com" },
      { row: 5, value: "" },
    ]);
  });

  it("reads a file with no header row from its first row, in the first column of addresses", () => {
    const found = addressesInCsv(
      "Ada,ada@example.com\nGrace,grace@example.com"
    );

    expect(found.columns).toStrictEqual(["Column 1", "Column 2"]);
    expect(found.column).toBe(1);
    expect(found.addresses).toStrictEqual([
      "ada@example.com",
      "grace@example.com",
    ]);
    expect(found.skipped).toStrictEqual([]);
  });

  it("reads quoted cells, Windows line ends, a byte order mark, and semicolons or tabs between cells", () => {
    const quoted = addressesInCsv(
      '﻿"Name","E-mail"\r\n"Lovelace, Ada","ada@example.com"\r\n"Hopper ""Grace""",grace@example.com\r\n'
    );

    expect(quoted.columns).toStrictEqual(["Name", "E-mail"]);
    expect(quoted.addresses).toStrictEqual([
      "ada@example.com",
      "grace@example.com",
    ]);

    expect(
      addressesInCsv('"Name, full";email\n"Lovelace, Ada";ada@example.com')
        .addresses
    ).toStrictEqual(["ada@example.com"]);

    for (const separator of [";", "\t"]) {
      expect(
        addressesInCsv(`email${separator}name\nada@example.com${separator}Ada`)
          .addresses
      ).toStrictEqual(["ada@example.com"]);
    }
  });

  it("prefers the column headed email to an earlier column of addresses, and reads the column the member chooses instead", () => {
    const csv = "Billing contact,Email\nbilling@example.com,ada@example.com";

    expect(addressesInCsv(csv).addresses).toStrictEqual(["ada@example.com"]);
    expect(addressesInCsv(csv, 0).addresses).toStrictEqual([
      "billing@example.com",
    ]);
  });

  it("reports a first row that looks like a mistyped address as skipped, not as the header", () => {
    const found = addressesInCsv("bob@@example.com\nada@example.com");

    expect(found.columns).toStrictEqual(["Column 1"]);
    expect(found.skipped).toStrictEqual([
      { row: 1, value: "bob@@example.com" },
    ]);
  });

  it("finds no addresses in a file without any", () => {
    const found = addressesInCsv("Name,Notes\nAda,likes tea");

    expect(found.column).toBeUndefined();
    expect(found.addresses).toStrictEqual([]);
  });
});
