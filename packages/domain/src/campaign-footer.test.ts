import { assert, describe, it } from "@effect/vitest";

import {
  postalAddressLine,
  withFooterHtml,
  withFooterText,
} from "./campaign-footer.ts";

const URL = "https://mail.acme.example/unsubscribe?token=1.abc.def";

describe("a Campaign email's footer", () => {
  it("puts the name and each line of the postal address on one line, leaving out blank lines", () => {
    assert.strictEqual(
      postalAddressLine(
        "Acme",
        " 14 Mill Lane \r\n\nBristol BS1 4XE\rUnited Kingdom "
      ),
      "Acme, 14 Mill Lane, Bristol BS1 4XE, United Kingdom"
    );
  });

  it.each([
    ["<", "&lt;"],
    [">", "&gt;"],
    ["&", "&amp;"],
    ['"', "&quot;"],
    ["'", "&#39;"],
  ])(
    "shows %s in a postal address as text, never as markup",
    (character, escaped) => {
      const html = withFooterHtml("<p>Hi</p>", {
        addressLine: `Acme${character}`,
        unsubscribeUrl: URL,
      });

      assert.include(html, `>Acme${escaped}</p>`);
    }
  );

  it("ends the HTML inside its body, with the unsubscribe link and then the address", () => {
    const html = withFooterHtml("<html><body><p>Hi</p></body></html>", {
      addressLine: "Acme, 14 Mill Lane",
      unsubscribeUrl: URL,
    });

    assert.match(
      html,
      /<p>Hi<\/p><p [^>]+>Don’t want these emails\? <a href="https:\/\/mail\.acme\.example\/unsubscribe\?token=1\.abc\.def" [^>]+>Unsubscribe<\/a><\/p><p [^>]+>Acme, 14 Mill Lane<\/p><\/body><\/html>$/u
    );
  });

  it("ends the plain text with the unsubscribe link and then the address", () => {
    assert.strictEqual(
      withFooterText("Hi", {
        addressLine: "Acme, 14 Mill Lane",
        unsubscribeUrl: URL,
      }),
      `Hi\n\nDon’t want these emails? Unsubscribe:\n${URL}\n\nAcme, 14 Mill Lane`
    );
  });

  it("ends the HTML inside its real body, never inside a comment that mentions one", () => {
    const html = withFooterHtml(
      "<html><body><p>Hi</p></body></html><!-- old template </body> -->",
      { addressLine: "Acme", unsubscribeUrl: URL }
    );

    assert.match(
      html,
      /Acme<\/p><\/body><\/html><!-- old template <\/body> -->$/u
    );
  });
});
