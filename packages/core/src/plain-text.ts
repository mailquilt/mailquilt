import { convert } from "html-to-text";
import type { FormatCallback } from "html-to-text";

// WARNING: html-to-text numbers a Roman-numeral list only up to 3,999 and throws past it, which would fail the batch on every retry, so such lists are bulleted instead.
const ROMAN_LISTS = ["ol[type='i']", "ol[type='I']"];

const HIDDEN = ["[style*='display:none']", "[style*='display: none']"];

// WARNING: the more specific selector wins, so a hidden Roman list needs its own skip, or the bullets would show it.
const HIDDEN_ROMAN_LISTS = ROMAN_LISTS.flatMap((list) =>
  HIDDEN.map((hidden) => `${list}${hidden}`)
);

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
 * tracking image leaves nothing. Each table row and cell is a block of its
 * own, since most email layouts are tables, and a Roman-numeral list is
 * bulleted. The page title, and anything hidden with `display: none`, such
 * as a preview line, aren't shown.
 */
export const plainTextOf = (html: string) =>
  convert(html, {
    formatters: { altTextOnly },
    limits: { ellipsis: "", maxDepth: MAX_DEPTH },
    selectors: [
      { format: "altTextOnly", selector: "img" },
      { format: "skip", selector: "title" },
      ...[...HIDDEN, ...HIDDEN_ROMAN_LISTS].map((selector) => ({
        format: "skip",
        selector,
      })),
      ...ROMAN_LISTS.map((selector) => ({
        format: "unorderedList",
        selector,
      })),
      { format: "block", selector: "table" },
      { format: "block", selector: "tr" },
      { format: "block", selector: "td" },
      { format: "block", selector: "th" },
      { options: { hideLinkHrefIfSameAsText: true }, selector: "a" },
    ],
  }).trim();
