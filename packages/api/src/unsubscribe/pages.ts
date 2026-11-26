import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import type { Unsubscription } from "@repo/core";
import { createElement as h, Fragment } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// WARNING: the dashboard's build publishes its stylesheet, with Kumo and the Mailquilt theme, under this name (apps/dashboard/vite.config.ts); rename both together.
const STYLESHEET = "/public-pages.css";

/**
 * Sets light or dark before the first paint, as the dashboard does
 * (`apps/dashboard/src/theme/theme.ts`): the visitor's saved choice, or else
 * their device's. Without JavaScript the page stays light.
 */
export const THEME_SCRIPT = `{const apply=()=>{let saved=null;try{saved=localStorage.getItem("mailquilt-theme")}catch{saved=null}const dark=saved==="dark"||(saved!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.mode=dark?"dark":"light"};apply();matchMedia("(prefers-color-scheme: dark)").addEventListener("change",apply)}`;

/** `THEME_SCRIPT`'s SHA-256, so the Content Security Policy allows it and nothing else. */
export const THEME_SCRIPT_HASH =
  "sha256-jKoITROcYU+fx/48QvXIt6+dWlcPqV3Jeizu5jECuFs=";

const STYLES = `
body { margin: 0; min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; padding: 0 24px; background: var(--color-kumo-base); color: var(--text-color-kumo-strong); font-family: var(--font-sans); text-align: center; }
.mq-public { width: 100%; max-width: 28rem; margin: 0 auto; padding-top: 64px; display: flex; flex-direction: column; align-items: center; gap: 18px; }
.mq-public-block { width: 88px; height: 88px; color: var(--mq-block-ink); }
.mq-public-block-row { width: auto; }
.mq-public-sender { margin: 0; font-family: var(--font-display); font-weight: 500; font-size: var(--text-lg); letter-spacing: -0.02em; color: var(--text-color-kumo-subtle); overflow-wrap: anywhere; }
.mq-public h1 { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: var(--text-display-md); line-height: var(--text-display-md--line-height); letter-spacing: -0.035em; text-wrap: balance; overflow-wrap: anywhere; }
.mq-public p { margin: 0; color: var(--mq-body); font-size: var(--text-lg); line-height: var(--text-lg--line-height); overflow-wrap: anywhere; }
.mq-public-email { color: var(--text-color-kumo-strong); font-weight: 500; }
.mq-public form { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 6px 0 0; }
.mq-public-more { margin-top: 18px; }
.mq-public-action { width: 100%; max-width: 20rem; justify-content: center; }
.mq-public-footer { margin-top: auto; padding: 32px 0 28px; font-size: var(--text-sm); color: var(--text-color-kumo-subtle); }
@media (min-width: 768px) { .mq-public { padding-top: 120px; } .mq-public h1 { font-size: var(--text-display-lg); line-height: var(--text-display-lg--line-height); } .mq-public-block { width: 104px; height: 104px; } }
`;

/**
 * The field every form on these pages posts. A post without it is a mail
 * app's one-click unsubscribe (RFC 8058), which gets no redirect.
 */
export const PAGE_FIELD = { name: "from", value: "page" } as const;

type BlockKind = "full" | "empty" | "all";

const dashed = {
  fill: "none",
  stroke: "currentColor",
} as const;

const Block = ({ kind }: { readonly kind: BlockKind }) => {
  if (kind === "full") {
    return h(
      "svg",
      {
        "aria-hidden": true,
        className: "mq-public-block",
        viewBox: "0 0 72 72",
      },
      h("rect", {
        fill: "currentColor",
        height: 64,
        rx: 6,
        width: 64,
        x: 4,
        y: 4,
      }),
      h("rect", {
        fill: "var(--color-kumo-base)",
        height: 26,
        rx: 2,
        width: 40,
        x: 16,
        y: 24,
      }),
      h("path", {
        d: "M17 25 L36 39 L55 25",
        fill: "none",
        stroke: "currentColor",
        strokeLinejoin: "round",
        strokeWidth: 3,
      })
    );
  }

  if (kind === "empty") {
    return h(
      "svg",
      {
        "aria-hidden": true,
        className: "mq-public-block",
        viewBox: "0 0 72 72",
      },
      h("rect", {
        ...dashed,
        height: 62,
        opacity: 0.6,
        rx: 6,
        strokeDasharray: "6 5",
        strokeWidth: 2.5,
        width: 62,
        x: 5,
        y: 5,
      })
    );
  }

  return h(
    "svg",
    {
      "aria-hidden": true,
      className: "mq-public-block mq-public-block-row",
      viewBox: "0 0 108 72",
    },
    ...[0, 38, 76].map((x) =>
      h("rect", {
        ...dashed,
        height: 26,
        key: x,
        opacity: 0.55,
        rx: 3,
        strokeDasharray: "4 3",
        strokeWidth: 2,
        width: 26,
        x: x + 3,
        y: 23,
      })
    )
  );
};

const PageField = () =>
  h("input", {
    name: PAGE_FIELD.name,
    type: "hidden",
    value: PAGE_FIELD.value,
  });

const PostButton = ({
  action,
  label,
  variant,
}: {
  readonly action: string;
  readonly label: string;
  readonly variant: "primary" | "secondary";
}) =>
  h(
    "form",
    { action, method: "post" },
    h(PageField),
    h(Button, { className: "mq-public-action", type: "submit", variant }, label)
  );

const page = ({
  block,
  body,
  sender,
  title,
}: {
  readonly block?: BlockKind;
  readonly body: ReactNode;
  readonly sender?: string;
  readonly title: string;
}) =>
  [
    '<!doctype html><html lang="en" data-theme="mailquilt"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    renderToStaticMarkup(h("title", null, title)),
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    `<script>${THEME_SCRIPT}</script>`,
    `<link rel="stylesheet" href="${STYLESHEET}">`,
    `<style>${STYLES}</style></head>`,
    renderToStaticMarkup(
      h(
        "body",
        null,
        h(
          "main",
          { className: "mq-public" },
          block === undefined ? null : h(Block, { kind: block }),
          sender === undefined
            ? null
            : h("p", { className: "mq-public-sender" }, sender),
          h("h1", null, title),
          body
        ),
        h("footer", { className: "mq-public-footer" }, "Sent with Mailquilt")
      )
    ),
    "</html>",
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

const AFTER_AT_OR_DOT = /(?<=[@.])/u;

// WARNING: an address may wrap only after "@" or a dot, never before its ending, as the dashboard's `Breakable` does; keep the two alike.
const breakPoints = (address: string) => {
  const parts = address.split(AFTER_AT_OR_DOT);

  if (parts.length > 1 && parts.at(-2)?.endsWith(".")) {
    parts.splice(-2, 2, `${parts.at(-2)}${parts.at(-1)}`);
  }

  return parts;
};

const Email = ({ address }: { readonly address: string }) =>
  h(
    "span",
    { className: "mq-public-email" },
    ...breakPoints(address).flatMap((part, index) =>
      index === 0 ? [part] : [h("wbr", { key: `break-${index}` }), part]
    )
  );

/** Asks whether to unsubscribe. Nothing changes until the button is pressed. */
export const confirmPage = (unsubscription: Unsubscription, action: string) => {
  const lists = listsOf(unsubscription.listNames);

  return page({
    block: "full",
    body: h(
      Fragment,
      null,
      h(
        "p",
        null,
        `${unsubscription.organizationName} will stop sending ${lists} to `,
        h(Email, { address: unsubscription.email }),
        "."
      ),
      h(PostButton, { action, label: "Unsubscribe", variant: "primary" })
    ),
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
    body: h(
      Fragment,
      null,
      h(
        "p",
        null,
        `${unsubscription.organizationName} won’t send ${listsOf(unsubscription.listNames)} to `,
        h(Email, { address: unsubscription.email }),
        " again."
      ),
      h(
        "form",
        { action: stopAllAction, className: "mq-public-more", method: "post" },
        h(PageField),
        h(
          "p",
          null,
          `Don’t want any marketing email from ${unsubscription.organizationName}?`
        ),
        h(
          Button,
          { type: "submit", variant: "secondary" },
          "Stop all marketing email"
        )
      )
    ),
    sender: unsubscription.organizationName,
    title: "You’re unsubscribed",
  });

/** Says the Contact has an Opt-out: no more Campaigns from the Organization. */
export const stoppedAllPage = (unsubscription: Unsubscription) =>
  page({
    block: "all",
    body: h(
      "p",
      null,
      `${unsubscription.organizationName} can’t send newsletters or offers to `,
      h(Email, { address: unsubscription.email }),
      " again. Emails about an order or your account may still arrive."
    ),
    sender: unsubscription.organizationName,
    title: `You won’t get marketing email from ${unsubscription.organizationName}`,
  });

/** For a link that was cut short, changed, or no longer names anyone. */
export const brokenLinkPage = () =>
  page({
    body: h(
      "p",
      null,
      "It may have been cut short when it was copied. Open it again from the email, or use the unsubscribe link in a newer email from the same sender."
    ),
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
    body: h(
      Fragment,
      null,
      h("p", null, "Nothing changed. Try again in a moment."),
      step === "load"
        ? h(
            LinkButton,
            { className: "mq-public-action", href: action, variant: "primary" },
            "Try again"
          )
        : h(PostButton, { action, label: "Try again", variant: "primary" })
    ),
    title: FAILED_TITLES[step],
  });
