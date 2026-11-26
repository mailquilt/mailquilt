import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { createElement as h } from "react";
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
.mq-public-email { display: inline-block; max-width: 100%; color: var(--text-color-kumo-strong); font-weight: 500; }
.mq-public form { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 6px 0 0; }
.mq-public .mq-public-more { margin-top: 18px; }
.mq-public-action { width: 100%; max-width: 20rem; justify-content: center; }
.mq-public-footer { margin-top: auto; padding: 32px 0 28px; font-size: var(--text-sm); color: var(--text-color-kumo-subtle); }
.mq-quilt { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: 100%; }
.mq-quilt-block { width: 40px; height: 40px; color: var(--mq-block-ink); }
.mq-public .mq-lists { width: 100%; margin: 10px 0 0; padding: 0; list-style: none; text-align: left; border-radius: 12px; box-shadow: 0 0 0 1px var(--color-kumo-line); }
.mq-lists li { display: flex; align-items: center; gap: 14px; padding: 14px 16px; }
.mq-lists li + li { border-top: 1px solid var(--color-kumo-hairline); }
.mq-list-block { width: 20px; height: 20px; flex: none; color: var(--mq-block-ink); }
.mq-list-block rect[stroke-dasharray], .mq-quilt-block rect[stroke-dasharray] { stroke-width: 4; stroke-dasharray: 7 6; }
.mq-list-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mq-public .mq-list-name { color: var(--text-color-kumo-strong); font-weight: 500; overflow-wrap: anywhere; }
.mq-public .mq-list-status { color: var(--text-color-kumo-subtle); font-size: var(--text-sm); line-height: var(--text-sm--line-height); }
.mq-public .mq-lists form { width: auto; margin: 0; }
.mq-notice { width: 100%; display: flex; gap: 10px; align-items: flex-start; text-align: left; border-radius: 10px; padding: 12px 14px; background: var(--color-kumo-recessed); }
.mq-public .mq-notice p { color: var(--text-color-kumo-strong); font-size: var(--text-base); line-height: var(--text-base--line-height); }
.mq-notice svg { flex: none; width: 20px; height: 20px; color: var(--mq-block-ink); }
@media (min-width: 768px) { .mq-public { padding-top: 120px; } .mq-public h1 { font-size: var(--text-display-lg); line-height: var(--text-display-lg--line-height); } .mq-public-block { width: 104px; height: 104px; } }
`;

/**
 * The field every form on these pages posts. A post without it is a mail
 * app's one-click unsubscribe (RFC 8058), which gets no redirect.
 */
export const PAGE_FIELD = { name: "from", value: "page" } as const;

export type BlockKind = "full" | "empty" | "all";

const dashed = {
  fill: "none",
  stroke: "currentColor",
} as const;

/**
 * The logo's blocks: a full envelope block, the empty dashed slot, or a row
 * of three slots. `className` sizes it; the page's own is large.
 */
export const Block = ({
  className = "mq-public-block",
  kind,
}: {
  readonly className?: string;
  readonly kind: BlockKind;
}) => {
  if (kind === "full") {
    return h(
      "svg",
      {
        "aria-hidden": true,
        className,
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
        className,
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
      className: `${className} mq-public-block-row`,
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

export const PageField = () =>
  h("input", {
    name: PAGE_FIELD.name,
    type: "hidden",
    value: PAGE_FIELD.value,
  });

export const PostButton = ({
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

/**
 * A whole public page: the shell, a block or another picture (`lead`) at
 * the top, the sender and title, and the body.
 */
export const page = ({
  block,
  body,
  lead,
  sender,
  tabTitle,
  title,
}: {
  readonly block?: BlockKind;
  readonly body: ReactNode;
  readonly lead?: ReactNode;
  readonly sender?: string;
  /** What the browser's tab says, and a screen reader reads first on load, when it isn't the title, such as what just changed. */
  readonly tabTitle?: string | undefined;
  readonly title: string;
}) =>
  [
    '<!doctype html><html lang="en" data-theme="mailquilt"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    renderToStaticMarkup(
      h("title", null, tabTitle === undefined ? title : `${tabTitle} ${title}`)
    ),
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
          block === undefined ? lead : h(Block, { kind: block }),
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

const AFTER_AT_OR_DOT = /(?<=[@.])/u;

// WARNING: an address may wrap only after "@" or a dot, never before its ending, as the dashboard's `Breakable` does; keep the two alike.
const breakPoints = (address: string) => {
  const parts = address.split(AFTER_AT_OR_DOT);

  if (parts.length > 1 && parts.at(-2)?.endsWith(".")) {
    parts.splice(-2, 2, `${parts.at(-2)}${parts.at(-1)}`);
  }

  return parts;
};

export const Email = ({ address }: { readonly address: string }) =>
  h(
    "span",
    { className: "mq-public-email" },
    ...breakPoints(address).flatMap((part, index) =>
      index === 0 ? [part] : [h("wbr", { key: `break-${index}` }), part]
    )
  );

/** Opens the Contact's preferences page, where they choose which Lists they get. */
export const ManagePreferences = ({ href }: { readonly href: string }) => {
  const link: ReactNode = h(
    LinkButton,
    { href, variant: "secondary" },
    "Manage preferences"
  );

  return link;
};

/** Offers the Opt-out: no more marketing email from the Organization. */
export const StopAllForm = ({
  action,
  organizationName,
}: {
  readonly action: string;
  readonly organizationName: string;
}) =>
  h(
    "form",
    { action, className: "mq-public-more", method: "post" },
    h(PageField),
    h("p", null, `Don’t want any marketing email from ${organizationName}?`),
    h(
      Button,
      { type: "submit", variant: "secondary" },
      "Stop all marketing email"
    )
  );
