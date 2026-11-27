import { Banner } from "@cloudflare/kumo";
import type { Campaign, Organization } from "@repo/domain";
import { Predicate } from "effect";
import { useEffect, useId } from "react";

import { formatCount } from "../audience/format.ts";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { stillToSend } from "./campaign-progress.tsx";
import { useCancelCampaign } from "./campaigns-api.ts";

/** Whether the API refused because the Campaign had already moved on, such as finished or cancelled elsewhere. */
export const movedOn = (failure: Error) =>
  Predicate.isTagged(failure, "CampaignNotSending") ||
  Predicate.isTagged(failure, "CampaignNotFound");

const contacts = (count: number) =>
  `${formatCount(count)} ${count === 1 ? "contact" : "contacts"}`;

const consequence = (campaign: Campaign) => {
  const { sent } = campaign.recipients;

  let kept = `The ${formatCount(sent)} who were sent it keep it.`;

  if (sent === 0) {
    kept = "No one has been sent it yet.";
  } else if (sent === 1) {
    kept = "The one contact who was sent it keeps it.";
  }

  return `The ${contacts(stillToSend(campaign))} it hasn’t reached won’t be sent it, and it can’t be resumed. ${kept}`;
};

/**
 * Asks before cancelling a sending or paused Campaign, saying how many it
 * won't reach, and cancels it. It stays open, busy, until the API answers. A
 * failure to reach the server stays in the dialog to try again; a Campaign
 * that had already finished or been cancelled is handed to the page through
 * `onRefused` when the API says so, and through `onOutdated` when asking
 * again shows it while the dialog is open.
 */
export const CancelCampaignDialog = ({
  campaign,
  finalFocus,
  onCancelled,
  onExited,
  onOpenChange,
  onOutdated,
  onRefused,
  open,
  organization,
}: {
  campaign: Campaign;
  finalFocus?: React.RefObject<HTMLElement | null>;
  onCancelled: (cancelled: Campaign) => void;
  /** `useDialog`'s `handleExited`, so it starts fresh after each close. */
  onExited?: () => void;
  onOpenChange: (open: boolean) => void;
  /** Called when asking again shows the Campaign is no longer sending or paused while the dialog is open. */
  onOutdated: () => void;
  onRefused: () => void;
  open: boolean;
  organization: Organization;
}) => {
  const cancel = useCancelCampaign(organization.id, campaign.id);
  const formId = useId();
  const paused = campaign.status === "paused";
  const underway = campaign.status === "sending" || paused;
  const { isPending, isSuccess } = cancel;

  // WARNING: the page asks again every couple of seconds; once the Campaign has finished, or someone else cancelled it, this dialog would offer to cancel what can't be, so it closes, and the page's status line says what happened.
  useEffect(() => {
    if (open && !underway && !isPending && !isSuccess) {
      onOutdated();
    }
  }, [isPending, isSuccess, onOutdated, open, underway]);

  const cancelCampaign = () => {
    if (cancel.isPending) {
      return;
    }

    cancel.mutate(undefined, {
      onError: (error) => {
        if (movedOn(error)) {
          onRefused();
        }
      },
      onSuccess: onCancelled,
    });
  };

  const stillWhat = paused ? "It’s still paused." : "It’s still sending.";

  const problem =
    cancel.error === null || movedOn(cancel.error)
      ? null
      : `${
          Predicate.isTagged(cancel.error, "SignInRequired")
            ? "You’ve been signed out. Sign in again, then cancel it."
            : "Mailquilt couldn’t reach its server. Check your connection, then try again."
        } ${stillWhat}`;

  return (
    <ActionDialog
      actionLabel="Cancel campaign"
      busy={cancel.isPending}
      description={consequence(campaign)}
      destructive
      dismissLabel={paused ? "Keep it paused" : "Keep sending"}
      finalFocus={finalFocus}
      formId={formId}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title={`Cancel “${campaign.subject}”?`}
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          cancelCampaign();
        }}
      >
        {problem === null ? null : (
          <Banner role="alert" title={problem} variant="error" />
        )}
      </form>
    </ActionDialog>
  );
};
