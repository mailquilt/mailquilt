import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "./routeTree.gen.ts";

const NEWS = "lst_01h455vb4pex5vsknk084sn02q";
const ADA = "cnt_01h455vb4pex5vsknk084sn02q";
const CONNECTION = "pcn_01h455vb4pex5vsknk084sn02q";

describe("the address of a page that keeps its search in it", () => {
  it.each([
    ["a List ID that doesn't parse", "/contacts?list=foo", "/contacts", {}],
    [
      "a status without its List",
      "/contacts?status=subscribed",
      "/contacts",
      {},
    ],
    [
      "a valid Contacts search",
      `/contacts?list=${NEWS}&status=subscribed&after=${ADA}`,
      `/contacts?list=${NEWS}&status=subscribed&after=${ADA}`,
      { after: ADA, list: NEWS, status: "subscribed" },
    ],
    [
      "a connection ID that doesn't parse",
      "/providers?connected=foo",
      "/providers",
      {},
    ],
    [
      "a valid Providers search",
      `/providers?connected=${CONNECTION}`,
      `/providers?connected=${CONNECTION}`,
      { connected: CONNECTION },
    ],
    [
      "an error that isn't text",
      "/email-verified?error=1",
      "/email-verified",
      {},
    ],
    [
      "a valid email-verified search",
      "/email-verified?error=TOKEN_EXPIRED",
      "/email-verified?error=TOKEN_EXPIRED",
      { error: "TOKEN_EXPIRED" },
    ],
  ])(
    "an address with %s gives the page only what its search decodes to",
    async (_, address, shownAddress, search) => {
      const router = createRouter({
        history: createMemoryHistory({ initialEntries: [address] }),
        routeTree,
      });

      await router.load();

      expect(router.state.matches.at(-1)?.search).toStrictEqual(search);
      expect(router.state.location.href).toBe(shownAddress);
    }
  );
});
