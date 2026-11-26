import { Button, Checkbox } from "@cloudflare/kumo";
import type { List, ListId, OrganizationId } from "@repo/domain";
import type { AnyFieldApi } from "@tanstack/react-form";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { formatCount } from "../audience/format.ts";
import { useFieldError } from "../forms/field-error.tsx";
import { MinusIcon } from "../icons/icons.tsx";
import { CampaignBlock } from "./campaign-status.tsx";
import { useRecipientCount } from "./campaigns-api.ts";

const subscribed = (count: number) =>
  count === 0 ? "No one subscribed" : `${formatCount(count)} subscribed`;

const inListOrder = (lists: readonly List[], chosen: ReadonlySet<string>) =>
  lists.flatMap((list) => (chosen.has(list.id) ? [list.id] : []));

const ListRow = ({
  checked,
  list,
  name,
  note,
  onChange,
}: {
  checked: boolean;
  list: List;
  name: string;
  note?: string;
  onChange: (checked: boolean) => void;
}) => {
  const nameId = useId();
  const countId = useId();

  return (
    <label className="mq-pick-row">
      <Checkbox
        aria-labelledby={`${nameId} ${countId}`}
        checked={checked}
        name={name}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <span
        className="min-w-0 flex-1 text-base wrap-anywhere text-kumo-default"
        id={nameId}
      >
        {list.name}
      </span>
      <span className="mq-pick-count" id={countId}>
        {note ?? subscribed(list.subscriptions.subscribed)}
      </span>
    </label>
  );
};

const GroupError = ({
  id,
  message,
  submissions,
}: {
  id: string;
  message: string | undefined;
  submissions: number;
}) =>
  message === undefined ? null : (
    <p
      className="text-sm text-kumo-danger"
      id={id}
      key={submissions}
      role="alert"
    >
      {message}
    </p>
  );

/**
 * "Who gets it": a checklist of the Organization's Lists to send to, and
 * behind "Leave out a list", a checklist of the others to leave out. A List is
 * in one or the other, never both: ticking a left-out List to send to takes
 * it out of Leave out. With one List there's nothing to leave out, so the
 * button isn't there.
 */
export const ListChecklists = ({
  leaveOut,
  lists,
  sendTo,
}: {
  leaveOut: AnyFieldApi;
  lists: readonly List[];
  sendTo: AnyFieldApi;
}) => {
  const sendToIds: readonly string[] = sendTo.state.value;
  const leaveOutIds: readonly string[] = leaveOut.state.value;
  const [open, setOpen] = useState(leaveOutIds.length > 0);
  const justOpened = useRef(false);
  const leaveOutGroup = useRef<HTMLFieldSetElement>(null);
  const sendToError = useFieldError(sendTo);
  const leaveOutError = useFieldError(leaveOut);
  const sendToErrorId = useId();
  const leaveOutErrorId = useId();
  const others = lists.filter((list) => !sendToIds.includes(list.id));

  // WARNING: "Leave out a list" leaves the page as it opens, so focus moves on purpose to what it opened; otherwise it drops to the page.
  useEffect(() => {
    if (!open || !justOpened.current) {
      return;
    }

    justOpened.current = false;

    const group = leaveOutGroup.current;

    (
      group?.querySelector<HTMLElement>('[role="checkbox"]') ??
      group?.querySelector<HTMLElement>("legend")
    )?.focus();
  }, [open]);

  const chooseToSend = (id: string, on: boolean) => {
    const chosen = new Set(sendToIds);

    if (on) {
      chosen.add(id);
    } else {
      chosen.delete(id);
    }

    sendTo.handleChange(inListOrder(lists, chosen));

    if (on && leaveOutIds.includes(id)) {
      leaveOut.handleChange(leaveOutIds.filter((other) => other !== id));
    }
  };

  const chooseToLeaveOut = (id: string, on: boolean) => {
    const chosen = new Set(leaveOutIds);

    if (on) {
      chosen.add(id);
    } else {
      chosen.delete(id);
    }

    leaveOut.handleChange(inListOrder(lists, chosen));
  };

  let leaveOutPart: React.ReactNode = (
    <div>
      <Button
        icon={MinusIcon}
        onClick={() => {
          justOpened.current = true;
          setOpen(true);
        }}
        variant="secondary"
      >
        Leave out a list
      </Button>
    </div>
  );

  if (lists.length === 1) {
    leaveOutPart = null;
  } else if (open) {
    leaveOutPart = (
      <fieldset
        aria-describedby={
          leaveOutError.message === undefined ? undefined : leaveOutErrorId
        }
        className="flex flex-col gap-2"
        ref={leaveOutGroup}
      >
        <legend
          className="mb-0.5 text-base font-medium text-kumo-default outline-none"
          tabIndex={-1}
        >
          Leave out
        </legend>
        <p className="mb-1.5 text-sm text-pretty text-kumo-subtle">
          Anyone who is or was on these lists won’t get it, even if they’re on a
          list above.
        </p>
        {others.length === 0 ? (
          <p className="text-sm text-kumo-subtle">
            Every list is chosen above.
          </p>
        ) : (
          <div
            className="mq-pick"
            data-invalid={leaveOutError.message === undefined ? undefined : ""}
          >
            {others.map((list) => (
              <ListRow
                checked={leaveOutIds.includes(list.id)}
                key={list.id}
                list={list}
                name={leaveOut.name}
                onChange={(on) => chooseToLeaveOut(list.id, on)}
              />
            ))}
          </div>
        )}
        <GroupError
          id={leaveOutErrorId}
          message={leaveOutError.message}
          submissions={leaveOutError.submissions}
        />
      </fieldset>
    );
  }

  return (
    <>
      <fieldset
        aria-describedby={
          sendToError.message === undefined ? undefined : sendToErrorId
        }
        className="flex flex-col gap-2"
      >
        <legend className="mb-2 text-base font-medium text-kumo-default">
          Send to
        </legend>
        <div
          className="mq-pick"
          data-invalid={sendToError.message === undefined ? undefined : ""}
        >
          {lists.map((list) => (
            <ListRow
              checked={sendToIds.includes(list.id)}
              key={list.id}
              list={list}
              name={sendTo.name}
              note={
                leaveOutIds.includes(list.id) ? "Left out below" : undefined
              }
              onChange={(on) => chooseToSend(list.id, on)}
            />
          ))}
        </div>
        <GroupError
          id={sendToErrorId}
          message={sendToError.message}
          submissions={sendToError.submissions}
        />
      </fieldset>
      {leaveOutPart}
    </>
  );
};

const Spinner = () => <span aria-hidden="true" className="mq-spin" />;

const contactsWouldGetIt = (count: number) => (
  <>
    <strong className="mq-reach-number">{formatCount(count)}</strong>{" "}
    {count === 1 ? "contact" : "contacts"} would get it now
  </>
);

/**
 * Whether the recipient count failed: also while it's asked for again, when
 * TanStack Query clears the error of a query that has no data yet. Shown as
 * failed until it comes, it's never drawn as a count it doesn't have.
 */
export const failedToCount = (count: {
  readonly isError: boolean;
  readonly data: number | undefined;
  readonly errorUpdatedAt: number;
}) => count.isError || (count.data === undefined && count.errorUpdatedAt > 0);

// WARNING: Try again leaves the page once the count comes; this runs while it's still there, so focus moves to the element around it that takes focus (`tabIndex={-1}`) rather than dropping to the page. Its ref may not be attached yet when this first runs, so it's found in the page.
/** Asks for the recipient count again after it failed; "Trying again…" while it does. */
export const TryAgain = ({
  className,
  onRetry,
  retrying,
}: {
  className?: string;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const button = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const node = button.current;
    const holder = node?.parentElement?.closest<HTMLElement>('[tabindex="-1"]');

    return () => {
      if (node !== null && node === document.activeElement) {
        holder?.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <Button
      aria-disabled={retrying || undefined}
      className={className}
      onClick={() => {
        if (!retrying) {
          onRetry();
        }
      }}
      ref={button}
      variant="secondary"
    >
      {retrying ? "Trying again…" : "Try again"}
    </Button>
  );
};

/**
 * How many Contacts the Lists chosen reach now, under the checklists, from
 * the same count the send uses. While a change is counted, the last number
 * stays, dimmed and said to be counting; it's never shown as current. When
 * it can't be counted, the draft can still be saved.
 */
export const ReachLine = ({
  excludedListIds,
  listIds,
  lists,
  organizationId,
}: {
  excludedListIds: readonly ListId[];
  listIds: readonly ListId[];
  lists: readonly List[];
  organizationId: OrganizationId;
}) => {
  const count = useRecipientCount(organizationId, { excludedListIds, listIds });

  if (listIds.length === 0) {
    return null;
  }

  let mark: React.ReactNode = <span className="mq-reach-block" />;
  let main: React.ReactNode;
  let detail = "Counted again at the moment you send.";
  let action: React.ReactNode = null;
  let dimmed = false;

  if (failedToCount(count)) {
    mark = <CampaignBlock status="draft" />;
    main = (
      <span className="text-kumo-strong">
        Mailquilt couldn’t count who it goes to.
      </span>
    );
    detail =
      "Check your connection, then try again. You can still save the draft.";
    action = (
      <TryAgain
        className="self-center"
        onRetry={() => count.refetch()}
        retrying={count.isFetching}
      />
    );
  } else if (count.isPlaceholderData) {
    dimmed = true;
    mark = <Spinner />;
    main = contactsWouldGetIt(count.data ?? 0);
    detail = "Counting again for the lists you just changed…";
  } else if (count.data === undefined) {
    mark = <Spinner />;
    main = <span className="text-kumo-subtle">Counting who it goes to…</span>;
  } else if (count.data === 0) {
    const anyoneSubscribed = lists.some(
      (list) => listIds.includes(list.id) && list.subscriptions.subscribed > 0
    );

    mark = <CampaignBlock status="draft" />;
    main = (
      <strong className="font-medium text-kumo-strong">
        No one would get it now
      </strong>
    );
    detail = anyoneSubscribed
      ? "Everyone subscribed to these lists is or was on a list you leave out, stopped all marketing email, or has a suppressed address. You can save the draft, but it can’t be sent until someone would get it."
      : "No one is subscribed to these lists yet. You can save the draft, but it can’t be sent until someone is.";
  } else {
    main = contactsWouldGetIt(count.data);
  }

  return (
    <div
      aria-live="polite"
      className="mq-reach outline-none"
      data-dimmed={dimmed ? "" : undefined}
      tabIndex={-1}
    >
      <span className="mq-reach-mark">{mark}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="mq-reach-main">{main}</p>
        <p className="text-sm leading-5 text-pretty text-kumo-subtle">
          {detail}
        </p>
      </div>
      {action}
    </div>
  );
};
