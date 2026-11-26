import { Banner } from "@cloudflare/kumo";
import type { Campaign, Organization } from "@repo/domain";
import { Predicate } from "effect";
import { useId } from "react";

import { formatCount } from "../audience/format.ts";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { useSendCampaign } from "./campaigns-api.ts";

/** Why the API wouldn't send it; each changes what the Campaign's page shows. */
export type SendRefusal =
  | "address"
  | "already"
  | "connection"
  | "gone"
  | "nobody";

const refusalOf = (failure: Error) => {
  if (Predicate.isTagged(failure, "CampaignNotDraft")) {
    return "already" satisfies SendRefusal;
  }

  if (Predicate.isTagged(failure, "ProviderConnectionNotFound")) {
    return "connection" satisfies SendRefusal;
  }

  if (Predicate.isTagged(failure, "NoSubscribedContacts")) {
    return "nobody" satisfies SendRefusal;
  }

  if (Predicate.isTagged(failure, "PostalAddressRequired")) {
    return "address" satisfies SendRefusal;
  }

  if (Predicate.isTagged(failure, "CampaignNotFound")) {
    return "gone" satisfies SendRefusal;
  }
};

const problemOf = (failure: Error) =>
  Predicate.isTagged(failure, "SignInRequired")
    ? "You’ve been signed out. Sign in again, then send it. It hasn’t been sent."
    : "Mailquilt couldn’t reach its server. Check your connection, then try again. It won’t be sent twice.";

/**
 * Asks before sending a draft to everyone subscribed to its List, and sends
 * it. It stays open, with Send now busy, until the API has taken it, and a
 * second press does nothing. A failure to reach the server stays in the
 * dialog to try again: sending is one transaction, so it can't go out
 * twice. A refusal that changes what the page shows, such as no one being
 * subscribed, is handed to the page through `onRefused`.
 */
export const SendCampaignDialog = ({
  campaign,
  connectionName,
  finalFocus,
  listName,
  onExited,
  onOpenChange,
  onRefused,
  onSent,
  open,
  organization,
  subscribed,
}: {
  campaign: Campaign;
  connectionName: string;
  finalFocus: React.RefObject<HTMLElement | null>;
  listName: string;
  onExited: () => void;
  onOpenChange: (open: boolean) => void;
  onRefused: (refusal: SendRefusal) => void;
  onSent: () => void;
  open: boolean;
  organization: Organization;
  subscribed: number;
}) => {
  const send = useSendCampaign(organization.id, campaign.id);
  const formId = useId();
  const failure = send.error;

  const problem =
    failure === null || refusalOf(failure) !== undefined
      ? undefined
      : problemOf(failure);

  const sendNow = () => {
    if (send.isPending) {
      return;
    }

    send.mutate(undefined, {
      onError: (error) => {
        const refusal = refusalOf(error);

        if (refusal !== undefined) {
          onRefused(refusal);
        }
      },
      onSuccess: onSent,
    });
  };

  return (
    <ActionDialog
      actionLabel="Send now"
      busy={send.isPending}
      description={`It goes now, through ${connectionName}, to the ${formatCount(subscribed)} ${subscribed === 1 ? "contact" : "contacts"} subscribed to ${listName}, except anyone who stopped all marketing email or whose address is suppressed. Once it starts, it can’t be stopped.`}
      finalFocus={finalFocus}
      formId={formId}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title="Send this campaign now?"
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          sendNow();
        }}
      >
        {problem === undefined ? null : (
          <Banner role="alert" title={problem} variant="error" />
        )}
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-base">
          <dt className="text-kumo-subtle">Subject</dt>
          <dd className="font-medium text-pretty break-words text-kumo-strong">
            {campaign.subject}
          </dd>
          <dt className="text-kumo-subtle">From</dt>
          <dd className="break-words text-kumo-default">
            {campaign.from.name === undefined ? null : (
              <>{campaign.from.name} </>
            )}
            <span className="text-kumo-subtle">{campaign.from.email}</span>
          </dd>
        </dl>
      </form>
    </ActionDialog>
  );
};
