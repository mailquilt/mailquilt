/**
 * What every Campaign email ends with: the Contact's own unsubscribe link and
 * the Organization's postal address on one line. Sending and the dashboard's
 * preview both use these, so the preview shows the footer as it's sent.
 */
export interface CampaignFooter {
  readonly unsubscribeUrl: string;
  /** From `postalAddressLine`, or `null` for a Campaign that started sending before Organizations had one. */
  readonly addressLine: string | null;
}

const LINE_BREAK = /\r?\n|\r/u;

/** The Organization's name and postal address on one line, its lines joined by commas. */
export const postalAddressLine = (
  organizationName: string,
  postalAddress: string
) =>
  [organizationName, ...postalAddress.split(LINE_BREAK)]
    .flatMap((line) => {
      const trimmed = line.trim();

      return trimmed === "" ? [] : [trimmed];
    })
    .join(", ");

const HTML_ESCAPES = new Map([
  ['"', "&quot;"],
  ["&", "&amp;"],
  ["'", "&#39;"],
  ["<", "&lt;"],
  [">", "&gt;"],
]);

const HTML_SPECIAL = /["&'<>]/gu;

const escapeHtml = (text: string) =>
  text.replaceAll(
    HTML_SPECIAL,
    (character) => HTML_ESCAPES.get(character) ?? character
  );

const FOOTER_STYLE =
  "font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#52525b;text-align:center";

const CLOSING_BODY = /<\/body>/giu;

const COMMENT = /<!--[\s\S]*?(?:-->|$)/gu;

const lastClosingBodyOutsideComments = (html: string) => {
  const comments = [...html.matchAll(COMMENT)].map(
    (comment) => [comment.index, comment.index + comment[0].length] as const
  );

  const outside = [...html.matchAll(CLOSING_BODY)].filter(
    (closing) =>
      !comments.some(
        ([start, end]) => closing.index >= start && closing.index < end
      )
  );

  return outside.at(-1)?.index;
};

/**
 * The Campaign's HTML with its footer at the foot, inside `<body>` when it
 * has one, never inside a comment. The address is the Organization's own
 * text, so it's escaped.
 */
export const withFooterHtml = (html: string, footer: CampaignFooter) => {
  const below = footer.addressLine === null ? "32px" : "0";
  const unsubscribe = `<p style="margin:32px 0 ${below};${FOOTER_STYLE}">Don’t want these emails? <a href="${escapeHtml(footer.unsubscribeUrl)}" style="color:#52525b">Unsubscribe</a></p>`;

  const address =
    footer.addressLine === null
      ? ""
      : `<p style="margin:6px 0 32px;${FOOTER_STYLE}">${escapeHtml(footer.addressLine)}</p>`;

  const at = lastClosingBodyOutsideComments(html);

  return at === undefined
    ? `${html}${unsubscribe}${address}`
    : `${html.slice(0, at)}${unsubscribe}${address}${html.slice(at)}`;
};

/** The Campaign's plain-text part with the same footer as `withFooterHtml`. */
export const withFooterText = (text: string, footer: CampaignFooter) => {
  const unsubscribe = `${text}\n\nDon’t want these emails? Unsubscribe:\n${footer.unsubscribeUrl}`;

  return footer.addressLine === null
    ? unsubscribe
    : `${unsubscribe}\n\n${footer.addressLine}`;
};
