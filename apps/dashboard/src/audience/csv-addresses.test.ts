import { describe, expect, it } from "vitest";

import { addressesIn, readCsv } from "./csv-addresses.ts";

const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff);

const inSuggestedColumn = (text: string) => {
  const file = readCsv(text);

  return { file, ...addressesIn(file, file.column ?? 0) };
};

describe(readCsv, () => {
  it("takes the column headed email, each address once whatever its case, and skips rows that aren't addresses", () => {
    const { addresses, file, skipped } = inSuggestedColumn(
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

    expect(file.columns).toStrictEqual(["Name", "Email", "Unsubscribed on"]);
    expect(file.column).toBe(1);
    expect(file.rows).toBe(5);
    expect(addresses).toStrictEqual(["ada@example.com", "grace@example.com"]);
    expect(skipped).toStrictEqual([
      { row: 3, value: "jane at example dot com" },
      { row: 5, value: "" },
    ]);
  });

  it("reads a file with no header row from its first row, in the first column of addresses", () => {
    const { addresses, file, skipped } = inSuggestedColumn(
      "Ada,ada@example.com\nGrace,grace@example.com"
    );

    expect(file.columns).toStrictEqual(["Column 1", "Column 2"]);
    expect(file.column).toBe(1);
    expect(addresses).toStrictEqual(["ada@example.com", "grace@example.com"]);
    expect(skipped).toStrictEqual([]);
  });

  it("reads quoted cells, Windows line ends, a byte order mark, and semicolons or tabs between cells", () => {
    const quoted = inSuggestedColumn(
      `${BYTE_ORDER_MARK}"Name ""as written""","E-mail"\r\n"Lovelace, Ada","ada@example.com"\r\n"Hopper",grace@example.com\r\n"Nobody",n/a\r\n`
    );

    expect(quoted.file.columns).toStrictEqual(['Name "as written"', "E-mail"]);
    expect(quoted.addresses).toStrictEqual([
      "ada@example.com",
      "grace@example.com",
    ]);
    expect(quoted.skipped).toStrictEqual([{ row: 4, value: "n/a" }]);
    expect(
      inSuggestedColumn('"Name, full";email\n"Lovelace, Ada";ada@example.com')
        .addresses
    ).toStrictEqual(["ada@example.com"]);

    for (const separator of [";", "\t"]) {
      expect(
        inSuggestedColumn(
          `email${separator}name\nada@example.com${separator}Ada`
        ).addresses
      ).toStrictEqual(["ada@example.com"]);
    }
  });

  it("suggests the column headed email over an earlier column of addresses, and reads the column the member chooses instead", () => {
    const file = readCsv(
      "Billing contact,Email\nbilling@example.com,ada@example.com"
    );

    expect(file.column).toBe(1);
    expect(addressesIn(file, 0).addresses).toStrictEqual([
      "billing@example.com",
    ]);
  });

  it("reports a first row that looks like a mistyped address as skipped, not as the header", () => {
    const { file, skipped } = inSuggestedColumn(
      "bob@@example.com\nada@example.com"
    );

    expect(file.columns).toStrictEqual(["Column 1"]);
    expect(skipped).toStrictEqual([{ row: 1, value: "bob@@example.com" }]);
  });

  it("reads a first row with no address and nothing over the address column as data, not as the header", () => {
    const { file, skipped } = inSuggestedColumn(
      "Bob,Smith\nAda,Lovelace,ada@example.com"
    );

    expect(file.columns).toStrictEqual(["Column 1", "Column 2", "Column 3"]);
    expect(skipped).toStrictEqual([{ row: 1, value: "" }]);
  });

  it("suggests no column in a file without any addresses", () => {
    expect(readCsv("Name,Notes\nAda,likes tea").column).toBeUndefined();
  });
});
