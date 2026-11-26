import { LinkButton } from "@cloudflare/kumo/components/button";
import type { UnsubscribePage, Unsubscription } from "@repo/core";
import { createElement as h, Fragment } from "react";

import {
  Email,
  ManagePreferences,
  page,
  PostButton,
  StopAllForm,
} from "../public-pages/shell.ts";

const listsOf = (names: readonly string[]) => {
  if (names.length === 0) {
    return "these emails";
  }

  if (names.length === 1) {
    return names[0] ?? "";
  }

  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
};

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

/** Says the Contact is off the Campaign's Lists, and offers their preferences and the Opt-out. */
export const unsubscribedPage = (
  unsubscription: UnsubscribePage,
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
      h(ManagePreferences, { href: unsubscription.preferencesPath }),
      h(StopAllForm, {
        action: stopAllAction,
        organizationName: unsubscription.organizationName,
      })
    ),
    sender: unsubscription.organizationName,
    title: "You’re unsubscribed",
  });

/** Says the Contact has an Opt-out, and offers their preferences, where they can lift it. */
export const stoppedAllPage = (unsubscription: UnsubscribePage) =>
  page({
    block: "all",
    body: h(
      Fragment,
      null,
      h(
        "p",
        null,
        `${unsubscription.organizationName} won’t send newsletters or offers to `,
        h(Email, { address: unsubscription.email }),
        " again. Emails about an order or your account may still arrive."
      ),
      h(ManagePreferences, { href: unsubscription.preferencesPath })
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
