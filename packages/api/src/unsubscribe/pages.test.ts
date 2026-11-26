import { assert, describe, it } from "@effect/vitest";

import { confirmPage, stoppedAllPage, unsubscribedPage } from "./pages.ts";

const HOSTILE = {
  email: `"><img src=x onerror=alert(1)>@example.com`,
  listNames: ["<script>alert(1)</script>", "Tom & Jerry's"],
  optedOut: false,
  organizationName: `Acme </title><script>alert(1)</script>`,
  preferencesPath: "/preferences?token=t",
  subscribed: true,
};

const WITHOUT_BREAKS = /<wbr\/>/gu;

const textOf = (html: string) => html.replaceAll(WITHOUT_BREAKS, "");

const pages = [
  ["confirm", textOf(confirmPage(HOSTILE, "/unsubscribe?token=t"))],
  [
    "unsubscribed",
    textOf(unsubscribedPage(HOSTILE, "/unsubscribe/all?token=t")),
  ],
  ["stopped all", textOf(stoppedAllPage(HOSTILE))],
] as const;

describe("unsubscribe pages", () => {
  it.each(pages)(
    "shows names and addresses as text on the %s page, never as markup",
    (_, html) => {
      assert.notInclude(html, "<script>alert(1)</script>");
      assert.notInclude(html, "<img src=x");
      assert.include(
        html,
        "Acme &lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;"
      );
      assert.include(
        html,
        "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;@example.com"
      );
    }
  );

  it("shows every List the Campaign targeted, escaped", () => {
    assert.include(
      confirmPage(HOSTILE, "/unsubscribe?token=t"),
      "&lt;script&gt;alert(1)&lt;/script&gt; and Tom &amp; Jerry&#x27;s"
    );
  });
});
