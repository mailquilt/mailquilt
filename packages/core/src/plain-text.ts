import { convert } from "html-to-text";
import type { FormatCallback } from "html-to-text";

// WARNING: html-to-text reads nested elements recursively, so HTML nested thousands deep overflows the stack and fails the whole batch; an email nests a few dozen deep, and text deeper than this is left out.
const MAX_DEPTH = 100;

const altTextOnly: FormatCallback = (element, _walk, builder) => {
  const alt = element.attribs?.["alt"]?.trim();

  if (alt !== undefined && alt !== "") {
    builder.addInline(alt);
  }
};

/**
 * The plain-text part of a Campaign email, made from its HTML: headings,
 * paragraphs and lists as text, a link's address in brackets after its
 * words, and an image as its alt text, never its address, so a spacer or
 * tracking image leaves nothing. The page title isn't shown.
 */
export const plainTextOf = (html: string) =>
  convert(html, {
    formatters: { altTextOnly },
    limits: { maxDepth: MAX_DEPTH },
    selectors: [
      { format: "altTextOnly", selector: "img" },
      { format: "skip", selector: "title" },
      { options: { hideLinkHrefIfSameAsText: true }, selector: "a" },
    ],
  });
