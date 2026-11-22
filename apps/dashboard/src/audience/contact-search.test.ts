import { describe, expect, it } from "vitest";

import { consistentSearch, decodeContactSearch } from "./contact-search.ts";

const LIST = "lst_01h455vb4pex5vsknk084sn02q";
const CONTACT = "cnt_01h455vb4pex5vsknk084sn02q";
const OTHER_CONTACT = "cnt_01h455vb4pex5vsknk084sn02p";

const read = (search: Readonly<Record<string, string>>) =>
  consistentSearch(decodeContactSearch(search));

describe("the Contacts table's URL", () => {
  it.each([
    [
      "keeps a List and a status on it",
      { list: LIST, status: "pending" },
      { list: LIST, status: "pending" },
    ],
    ["drops a status without a List", { status: "pending" }, {}],
    [
      "drops a status that doesn't exist",
      { list: LIST, status: "maybe" },
      { list: LIST },
    ],
    ["drops an ID of the wrong kind", { after: LIST, list: CONTACT }, {}],
    [
      "keeps only the forward cursor when both are given",
      { after: CONTACT, before: OTHER_CONTACT },
      { after: CONTACT },
    ],
  ])("%s", (_, search, expected) => {
    expect(read(search)).toStrictEqual(expected);
  });
});
