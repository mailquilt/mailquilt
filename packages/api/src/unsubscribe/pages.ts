import type { Unsubscription } from "@repo/core";

const STYLES = `
@font-face { font-family: "Space Grotesk"; src: url("/fonts/space-grotesk-latin-wght-normal.woff2") format("woff2"); font-weight: 300 700; font-display: optional; }
@font-face { font-family: "Instrument Sans"; src: url("/fonts/instrument-sans-latin-wght-normal.woff2") format("woff2"); font-weight: 400 700; font-display: optional; }
:root {
  color-scheme: light dark;
  --bg: #ffffff; --ink: #111113; --body: #52525b; --muted: #71717a; --block: #111113;
  --button: #111113; --button-ink: #ffffff; --line: #d4d4d8; --focus: #111113;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111113; --ink: #f4f4f5; --body: #a1a1aa; --muted: #8b949e; --block: #e4e4e7;
    --button: #f4f4f5; --button-ink: #111113; --line: #3f3f46; --focus: #f4f4f5;
  }
}
* { box-sizing: border-box; }
html { background: var(--bg); }
body { margin: 0; min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; background: var(--bg); color: var(--ink); font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif; text-align: center; padding: 0 24px; }
main { width: 100%; max-width: 28rem; margin: 0 auto; padding-top: 64px; display: flex; flex-direction: column; align-items: center; gap: 18px; }
@media (min-width: 768px) { main { padding-top: 120px; } h1 { font-size: 40px; } .block { width: 104px; height: 104px; } }
.block { width: 88px; height: 88px; color: var(--block); }
.block.all { width: auto; }
.sender { margin: 0; font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif; font-weight: 500; font-size: 16px; letter-spacing: -0.02em; color: var(--muted); overflow-wrap: anywhere; }
h1 { margin: 0; font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif; font-weight: 700; font-size: 30px; line-height: 1.12; letter-spacing: -0.035em; text-wrap: balance; overflow-wrap: anywhere; }
p { margin: 0; color: var(--body); font-size: 16px; line-height: 1.55; overflow-wrap: anywhere; }
.email { color: var(--ink); font-weight: 500; }
form { width: 100%; display: flex; justify-content: center; margin: 6px 0 0; }
button, .again { font: 600 16px/1 "Instrument Sans", ui-sans-serif, system-ui, sans-serif; border-radius: 8px; padding: 14px 20px; border: 1px solid var(--button); background: var(--button); color: var(--button-ink); cursor: pointer; width: 100%; max-width: 20rem; text-decoration: none; }
.again { display: block; margin-top: 6px; }
.more { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 18px; width: 100%; }
.more button { width: auto; font-size: 15px; padding: 13px 18px; background: transparent; color: var(--ink); border-color: var(--muted); }
button:focus-visible, .again:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
footer { margin-top: auto; padding: 32px 0 28px; font-size: 13px; color: var(--muted); }
`;

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/**
 * The field every form on these pages posts. A post without it is a mail
 * app's one-click unsubscribe (RFC 8058), which gets no redirect.
 */
export const PAGE_FIELD = { name: "from", value: "page" } as const;

const FROM_PAGE = `<input type="hidden" name="${PAGE_FIELD.name}" value="${PAGE_FIELD.value}">`;

type BlockKind = "full" | "empty" | "all";

const BLOCKS: Readonly<Record<BlockKind, string>> = {
  all: `<svg aria-hidden="true" class="block all" viewBox="0 0 108 72">${[
    0, 38, 76,
  ]
    .map(
      (x) =>
        `<rect fill="none" height="26" opacity="0.55" rx="3" stroke="currentColor" stroke-dasharray="4 3" stroke-width="2" width="26" x="${x + 3}" y="23"/>`
    )
    .join("")}</svg>`,
  empty:
    '<svg aria-hidden="true" class="block" viewBox="0 0 72 72"><rect fill="none" height="62" opacity="0.6" rx="6" stroke="currentColor" stroke-dasharray="6 5" stroke-width="2.5" width="62" x="5" y="5"/></svg>',
  full: '<svg aria-hidden="true" class="block" viewBox="0 0 72 72"><rect fill="currentColor" height="64" rx="6" width="64" x="4" y="4"/><rect fill="var(--bg)" height="26" rx="2" width="40" x="16" y="24"/><path d="M17 25 L36 39 L55 25" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="3"/></svg>',
};

const page = ({
  block,
  body,
  sender,
  title,
}: {
  readonly block?: BlockKind;
  readonly body: string;
  readonly sender?: string;
  readonly title: string;
}) =>
  [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    `<title>${escape(title)}</title>`,
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="preload" href="/fonts/space-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>',
    '<link rel="preload" href="/fonts/instrument-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>',
    `<style>${STYLES}</style></head><body><main>`,
    block === undefined ? "" : BLOCKS[block],
    sender === undefined ? "" : `<p class="sender">${escape(sender)}</p>`,
    `<h1>${escape(title)}</h1>`,
    body,
    "</main><footer>Sent with Mailquilt</footer></body></html>",
  ].join("");

const listsOf = (names: readonly string[]) => {
  if (names.length === 0) {
    return "these emails";
  }

  if (names.length === 1) {
    return names[0] ?? "";
  }

  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
};

const email = (address: string) =>
  `<span class="email">${escape(address)}</span>`;

const button = (action: string, label: string) =>
  `<form action="${escape(action)}" method="post">${FROM_PAGE}<button type="submit">${escape(label)}</button></form>`;

/** Asks whether to unsubscribe. Nothing changes until the button is pressed. */
export const confirmPage = (unsubscription: Unsubscription, action: string) => {
  const lists = listsOf(unsubscription.listNames);

  return page({
    block: "full",
    body: `<p>${escape(unsubscription.organizationName)} will stop sending ${escape(lists)} to ${email(unsubscription.email)}.</p>${button(action, "Unsubscribe")}`,
    sender: unsubscription.organizationName,
    title: `Unsubscribe from ${lists}?`,
  });
};

/** Says the Contact is off the Campaign's Lists, and offers the Opt-out. */
export const unsubscribedPage = (
  unsubscription: Unsubscription,
  stopAllAction: string
) =>
  page({
    block: "empty",
    body: `<p>${escape(unsubscription.organizationName)} won’t send ${escape(listsOf(unsubscription.listNames))} to ${email(unsubscription.email)} again.</p><form action="${escape(stopAllAction)}" method="post" class="more">${FROM_PAGE}<p>Don’t want any marketing email from ${escape(unsubscription.organizationName)}?</p><button type="submit">Stop all marketing email</button></form>`,
    sender: unsubscription.organizationName,
    title: "You’re unsubscribed",
  });

/** Says the Contact has an Opt-out: no more Campaigns from the Organization. */
export const stoppedAllPage = (unsubscription: Unsubscription) =>
  page({
    block: "all",
    body: `<p>${escape(unsubscription.organizationName)} can’t send newsletters or offers to ${email(unsubscription.email)} again. Emails about an order or your account may still arrive.</p>`,
    sender: unsubscription.organizationName,
    title: `You won’t get marketing email from ${unsubscription.organizationName}`,
  });

/** For a link that was cut short, changed, or no longer names anyone. */
export const brokenLinkPage = () =>
  page({
    body: "<p>It may have been cut short when it was copied. Open it again from the email, or use the unsubscribe link in a newer email from the same sender.</p>",
    title: "This unsubscribe link doesn’t work",
  });

/** The step a failed page offers to try again. */
export type FailedStep = "load" | "unsubscribe" | "stop marketing";

const FAILED_TITLES: Readonly<Record<FailedStep, string>> = {
  load: "This page didn’t load",
  "stop marketing": "Stopping marketing email didn’t work",
  unsubscribe: "Unsubscribing didn’t work",
};

/**
 * When the server failed. Nothing changed. Try again repeats the step: the
 * same post, or loading the page again. It shows no block, because it can't
 * know whether the Contact is still subscribed.
 */
export const failedPage = (step: FailedStep, action: string) =>
  page({
    body: `<p>Nothing changed. Try again in a moment.</p>${
      step === "load"
        ? `<a class="again" href="${escape(action)}">Try again</a>`
        : button(action, "Try again")
    }`,
    title: FAILED_TITLES[step],
  });
