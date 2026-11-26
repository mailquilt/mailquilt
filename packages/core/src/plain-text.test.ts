import { assert, describe, it } from "@effect/vitest";

import { plainTextOf } from "./plain-text.ts";

describe("a Campaign's plain-text part", () => {
  it("gives an image as its alt text only, and leaves out images with none", () => {
    assert.strictEqual(
      plainTextOf(
        '<p><img src="https://acme.example/sale.png" alt="Half price this week"><img src="https://acme.example/spacer.gif" alt=""></p>'
      ),
      "Half price this week"
    );
  });

  it("gives a link's address after its words, once", () => {
    assert.strictEqual(
      plainTextOf(
        '<p>Read <a href="https://acme.example/post">our post</a> at <a href="https://acme.example">https://acme.example</a></p>'
      ),
      "Read our post [https://acme.example/post] at https://acme.example"
    );
  });

  it("still makes a text part from HTML nested too deeply to read whole, so the send doesn't fail", () => {
    const tooDeep = `${"<div>".repeat(5000)}lost${"</div>".repeat(5000)}`;

    assert.isTrue(plainTextOf(`<p>Hello!</p>${tooDeep}`).startsWith("Hello!"));
  });

  it("leaves out the page title, which the HTML never shows", () => {
    assert.strictEqual(
      plainTextOf(
        "<html><head><title>Acme news</title></head><p>Hello!</p></html>"
      ),
      "Hello!"
    );
  });
});
