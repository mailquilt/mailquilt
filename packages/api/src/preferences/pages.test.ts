import { assert, describe, it } from "@effect/vitest";
import { ListIdSchema } from "@repo/domain";

import { preferencesPage } from "./pages.ts";

const LIST_ID = ListIdSchema.make("lst_01h455vb4pex5vsknk084sn02q");

const ACTIONS = {
  stopAll: "/preferences/all?token=t",
  subscribe: "/preferences/subscribe?token=t",
  unsubscribe: "/preferences/unsubscribe?token=t",
};

const WITHOUT_BREAKS = /<wbr\/>/gu;

describe("preferences page", () => {
  it("shows names and addresses as text, never as markup", () => {
    const html = preferencesPage(
      {
        email: `"><img src=x onerror=alert(1)>@example.com`,
        lists: [
          { id: LIST_ID, name: "<script>alert(1)</script>", subscribed: true },
        ],
        optedOut: false,
        organizationName: `Acme </title><script>alert(2)</script>`,
      },
      ACTIONS,
      { change: "subscribed", listId: LIST_ID }
    ).replaceAll(WITHOUT_BREAKS, "");

    assert.notInclude(html, "<script>alert");
    assert.notInclude(html, "<img src=x");
    assert.include(html, "&lt;script&gt;alert(1)&lt;/script&gt;");
    assert.include(
      html,
      "Acme &lt;/title&gt;&lt;script&gt;alert(2)&lt;/script&gt;"
    );
    assert.include(
      html,
      "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;@example.com"
    );
  });
});
