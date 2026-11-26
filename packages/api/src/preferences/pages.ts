import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import type { ContactPreferences, PreferenceList } from "@repo/core";
import { createElement as h, Fragment } from "react";

import { Block, Email, page, StopAllForm } from "../public-pages/shell.ts";

/** Where each form on the page posts, all carrying the link's token. */
export interface PreferencesActions {
  readonly subscribe: string;
  readonly unsubscribe: string;
  readonly stopAll: string;
}

/** What the Contact just changed, said at the top of the page they come back to. */
export interface PreferencesNotice {
  readonly change: "subscribed" | "unsubscribed";
  readonly listId: string;
}

const Check = () =>
  h(
    "svg",
    {
      "aria-hidden": true,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      viewBox: "0 0 24 24",
    },
    h("path", {
      d: "M5 12.5l4.5 4.5L19 7.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    })
  );

const Notice = ({ text }: { readonly text: string }) =>
  h(
    "div",
    { className: "mq-notice", role: "status" },
    h(Check),
    h("p", null, text)
  );

const noticeText = (
  lists: readonly PreferenceList[],
  notice: PreferencesNotice | undefined
) => {
  const list = lists.find((candidate) => candidate.id === notice?.listId);

  if (notice === undefined || list === undefined) {
    return;
  }

  if (notice.change === "subscribed" && list.subscribed) {
    return `You’re subscribed to ${list.name}.`;
  }

  if (notice.change === "unsubscribed" && !list.subscribed) {
    return `You’re unsubscribed from ${list.name}.`;
  }
};

const statusOf = (list: PreferenceList, justChanged: boolean) => {
  if (justChanged) {
    return list.subscribed ? "Subscribed just now" : "Unsubscribed just now";
  }

  return list.subscribed ? "You get these" : "You don’t get these";
};

const ListRow = ({
  actions,
  justChanged,
  list,
}: {
  readonly actions: PreferencesActions;
  readonly justChanged: boolean;
  readonly list: PreferenceList;
}) =>
  h(
    "li",
    null,
    h(Block, {
      className: "mq-list-block",
      kind: list.subscribed ? "full" : "empty",
    }),
    h(
      "span",
      { className: "mq-list-text" },
      h("span", { className: "mq-list-name" }, list.name),
      h("span", { className: "mq-list-status" }, statusOf(list, justChanged))
    ),
    h(
      "form",
      {
        action: list.subscribed ? actions.unsubscribe : actions.subscribe,
        method: "post",
      },
      h("input", { name: "list", type: "hidden", value: list.id }),
      h(
        Button,
        {
          "aria-label": `${list.subscribed ? "Unsubscribe from" : "Subscribe to"} ${list.name}`,
          type: "submit",
          variant: "secondary",
        },
        list.subscribed ? "Unsubscribe" : "Subscribe"
      )
    )
  );

/**
 * The Lists the Contact has a Subscription to, each with its own button,
 * which posts at once and comes back here, so it works without JavaScript.
 * With an Opt-out, every List shows as off, because none is sent until they
 * choose one again; subscribing to one lifts the Opt-out for that List alone.
 */
export const preferencesPage = (
  preferences: ContactPreferences,
  actions: PreferencesActions,
  notice?: PreferencesNotice
) => {
  const lists = preferences.lists.map((list) => ({
    ...list,
    subscribed: list.subscribed && !preferences.optedOut,
  }));

  const said = noticeText(lists, notice);
  const { organizationName } = preferences;

  const intro = preferences.optedOut
    ? h(
        "p",
        null,
        `${organizationName} won’t send newsletters or offers to `,
        h(Email, { address: preferences.email }),
        ". Subscribe to a list to get that list again, and nothing else."
      )
    : h(
        "p",
        null,
        `The lists ${organizationName} sends to `,
        h(Email, { address: preferences.email }),
        "."
      );

  return page({
    body: h(
      Fragment,
      null,
      intro,
      said === undefined ? null : h(Notice, { text: said }),
      h(
        "ul",
        { className: "mq-lists" },
        ...lists.map((list) =>
          h(ListRow, {
            actions,
            justChanged: said !== undefined && list.id === notice?.listId,
            key: list.id,
            list,
          })
        )
      ),
      preferences.optedOut
        ? null
        : h(StopAllForm, { action: actions.stopAll, organizationName })
    ),
    lead: h(
      "div",
      { "aria-hidden": true, className: "mq-quilt" },
      ...lists.map((list) =>
        h(Block, {
          className: "mq-quilt-block",
          key: list.id,
          kind: list.subscribed ? "full" : "empty",
        })
      )
    ),
    sender: organizationName,
    tabTitle: said,
    title: preferences.optedOut
      ? "You’ve stopped all marketing email"
      : "Choose what you get",
  });
};

/** For a Contact with no Subscription to any List: nothing to change. */
export const noListsPage = (preferences: ContactPreferences) =>
  page({
    block: "empty",
    body: h(
      "p",
      null,
      `${preferences.organizationName} doesn’t send any lists to `,
      h(Email, { address: preferences.email }),
      ", so there’s nothing to change here."
    ),
    sender: preferences.organizationName,
    title: "You’re not on any lists",
  });

/** For a link that was cut short, changed, or no longer names anyone. */
export const brokenPreferencesLinkPage = () =>
  page({
    body: h(
      "p",
      null,
      "It may have been cut short when it was copied. Open it again from the email, or use the link in a newer email from the same sender."
    ),
    title: "This preferences link doesn’t work",
  });

/** The step that failed on the preferences page. */
export type PreferencesStep =
  | "load"
  | "subscribe"
  | "unsubscribe"
  | "stop marketing";

const FAILED_TITLES: Readonly<Record<PreferencesStep, string>> = {
  load: "This page didn’t load",
  "stop marketing": "Stopping marketing email didn’t work",
  subscribe: "Subscribing didn’t work",
  unsubscribe: "Unsubscribing didn’t work",
};

/**
 * When the server failed. Nothing changed. Try again repeats the step: the
 * same post, with the same List, or loading the page again.
 */
export const failedPreferencesPage = (
  step: PreferencesStep,
  action: string,
  list = ""
) =>
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
        : h(
            "form",
            { action, method: "post" },
            h("input", { name: "list", type: "hidden", value: list }),
            h(
              Button,
              {
                className: "mq-public-action",
                type: "submit",
                variant: "primary",
              },
              "Try again"
            )
          )
    ),
    title: FAILED_TITLES[step],
  });
