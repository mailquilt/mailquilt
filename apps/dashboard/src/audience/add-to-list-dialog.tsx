import { Banner, Radio, useKumoToastManager } from "@cloudflare/kumo";
import type { AddedToList, ContactId, List, Organization } from "@repo/domain";
import { useId, useState } from "react";

import { ActionDialog } from "../layout/action-dialog.tsx";
import { useAddToList } from "./audience-api.ts";
import { formatCount } from "./format.ts";

const contacts = (count: number) =>
  count === 1 ? "1 contact" : `${formatCount(count)} contacts`;

const people = (count: number, one: string, many: string) =>
  `${formatCount(count)} ${count === 1 ? one : many}`;

/** What adding Contacts to `list` did, in a sentence each. */
export const addedToListMessage = (result: AddedToList, list: List) => {
  const unchanged = [
    result.alreadySubscribed > 0
      ? `${people(result.alreadySubscribed, "was", "were")} already subscribed.`
      : null,
    result.leftUnsubscribed > 0
      ? `${people(result.leftUnsubscribed, "stays", "stay")} unsubscribed, as they chose.`
      : null,
    result.leftPending > 0
      ? `${people(result.leftPending, "still hasn’t", "still haven’t")} confirmed.`
      : null,
  ].filter((sentence) => sentence !== null);

  return {
    description: unchanged.length === 0 ? undefined : unchanged.join(" "),
    title:
      result.added === 0
        ? `Nobody new was added to ${list.name}`
        : `Added ${contacts(result.added)} to ${list.name}`,
  };
};

/**
 * Subscribes the selected Contacts to one List. Anyone who unsubscribed from
 * it, or hasn't confirmed, is left as they are, and the toast says so. The
 * selection stays, so the same Contacts can go on another List next. Mount it
 * afresh for each opening (a new `key`), so it starts with the first List.
 */
export const AddToListDialog = ({
  contactIds,
  finalFocus,
  lists,
  onOpenChange,
  open,
  organization,
}: {
  contactIds: readonly [ContactId, ...ContactId[]];
  finalFocus?: React.RefObject<HTMLElement | null>;
  lists: readonly List[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organization: Organization;
}) => {
  const add = useAddToList(organization.id);
  const toasts = useKumoToastManager();
  const formId = useId();
  const [chosen, setChosen] = useState(lists[0]?.id);

  const list = lists.find((candidate) => candidate.id === chosen);

  return (
    <ActionDialog
      actionLabel="Add to list"
      busy={add.isPending}
      description="They’ll get the campaigns sent to the list you choose. Anyone who unsubscribed from it stays unsubscribed."
      finalFocus={finalFocus}
      formId={formId}
      onOpenChange={onOpenChange}
      open={open}
      title={`Add ${contacts(contactIds.length)} to a list`}
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();

          if (list === undefined) {
            return;
          }

          add.mutate(
            { contactIds, listId: list.id },
            {
              onSuccess: (result) => {
                onOpenChange(false);
                toasts.add(addedToListMessage(result, list));
              },
            }
          );
        }}
      >
        {add.isError ? (
          <Banner
            role="alert"
            title="Mailquilt couldn’t add them. Check your connection, then try again."
            variant="error"
          />
        ) : null}
        <Radio.Group onValueChange={(value) => setChosen(value)} value={chosen}>
          <Radio.Legend className="sr-only">List</Radio.Legend>
          <ul className="-mx-1 flex max-h-64 flex-col overflow-y-auto px-1">
            {lists.map((candidate) => (
              <li
                className="flex min-h-11 items-center gap-3 border-b border-kumo-hairline first:border-t"
                key={candidate.id}
              >
                <Radio.Item label={candidate.name} value={candidate.id} />
                <span className="ml-auto shrink-0 text-sm text-kumo-subtle tabular-nums">
                  {formatCount(candidate.subscriptions.subscribed)} subscribed
                </span>
              </li>
            ))}
          </ul>
        </Radio.Group>
      </form>
    </ActionDialog>
  );
};
