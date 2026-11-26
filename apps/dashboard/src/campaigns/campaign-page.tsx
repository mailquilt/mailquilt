import { Banner, Button, LinkButton } from "@cloudflare/kumo";
import { postalAddressLine, withFooterHtml } from "@repo/domain";
import type {
  Campaign,
  CampaignId,
  List,
  Organization,
  ProviderConnection,
} from "@repo/domain";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { loadingFirstTime } from "../api.ts";
import { useList } from "../audience/audience-api.ts";
import { formatCount } from "../audience/format.ts";
import { PaperPlaneTiltIcon, PencilSimpleIcon } from "../icons/icons.tsx";
import { useDialog } from "../layout/action-dialog.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageHeader } from "../layout/page-header.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { SettingsSection } from "../layout/settings-section.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useProviderConnections } from "../providers/providers-api.ts";
import { formatMoment, formatSince } from "./campaign-dates.ts";
import { CampaignBlock } from "./campaign-status.tsx";
import { useCampaign, useRefreshCampaignPages } from "./campaigns-api.ts";
import { EmailPreview } from "./email-preview.tsx";
import { SendCampaignDialog } from "./send-campaign-dialog.tsx";
import type { SendRefusal } from "./send-campaign-dialog.tsx";

const CRUMBS = [{ href: "/campaigns", label: "Campaigns" }];

const ABOUT_THE_PAGE = "Who a campaign goes to, who it’s from, and the email.";

const contacts = (count: number) =>
  `${formatCount(count)} ${count === 1 ? "contact" : "contacts"}`;

const sentTo = ({ recipients }: Campaign) =>
  recipients.failed === 0
    ? contacts(recipients.total)
    : `${formatCount(recipients.sent)} of ${contacts(recipients.total)}`;

const Strong = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-medium text-kumo-strong">{children}</strong>
);

const statusWords = (campaign: Campaign, connectionName: string) => {
  if (campaign.status === "sent") {
    const when =
      campaign.sentAt === null ? "" : ` ${formatMoment(campaign.sentAt)}`;

    const { failed } = campaign.recipients;

    return (
      <>
        <Strong>Sent</Strong> to {sentTo(campaign)}
        {when}.
        {failed === 0 ? null : (
          <span className="text-kumo-subtle">
            {" "}
            {formatCount(failed)} couldn’t be sent through {connectionName}.
          </span>
        )}
      </>
    );
  }

  if (campaign.status === "sending") {
    const since =
      campaign.sendingStartedAt === null
        ? ""
        : ` since ${formatSince(campaign.sendingStartedAt)}`;

    return (
      <>
        <Strong>Sending</Strong> to {contacts(campaign.recipients.total)}
        {since}. It carries on if you close this page.
      </>
    );
  }

  return (
    <>
      <Strong>Draft</Strong>, created {formatMoment(campaign.createdAt)}.
      Nothing has been sent.
    </>
  );
};

const StatusLine = ({
  campaign,
  connectionName,
  ref,
}: {
  campaign: Campaign;
  connectionName: string;
  ref: React.RefObject<HTMLSpanElement | null>;
}) => {
  const sendingHeight = useRef<number>(undefined);
  const [heldHeight, setHeldHeight] = useState<number>();

  // WARNING: on a narrow screen "Sending … It carries on if you close this page." takes more lines than "Sent …", so the line keeps the height it had while sending, or everything below would jump as it finishes; a resize lets it go.
  useLayoutEffect(() => {
    if (campaign.status === "sending") {
      sendingHeight.current = ref.current?.offsetHeight;
    } else if (campaign.status === "sent") {
      setHeldHeight(sendingHeight.current);
    }
  }, [campaign.status, ref]);

  useEffect(() => {
    if (heldHeight === undefined) {
      return;
    }

    const release = () => setHeldHeight(undefined);

    window.addEventListener("resize", release, { once: true });

    return () => window.removeEventListener("resize", release);
  }, [heldHeight]);

  const held: Record<string, string> | undefined =
    heldHeight === undefined
      ? undefined
      : { "--mq-held-height": `${heldHeight}px` };

  return (
    <span
      className="flex min-h-(--mq-held-height) items-start gap-2 outline-none"
      ref={ref}
      style={held}
      tabIndex={-1}
    >
      <span className="flex h-lh items-center">
        <CampaignBlock live status={campaign.status} />
      </span>
      <span className="min-w-0 break-words">
        {statusWords(campaign, connectionName)}
      </span>
    </span>
  );
};

const Missing = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-2 text-kumo-subtle">
    <CampaignBlock status="draft" />
    {children}
  </span>
);

const Facts = ({ rows }: { rows: FactRows }) => (
  <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-base max-sm:grid-cols-1 max-sm:gap-y-2.5">
    {rows.map(([term, value]) => (
      <div
        className="contents max-sm:flex max-sm:flex-col max-sm:gap-0.5"
        key={term}
      >
        <dt className="text-kumo-subtle max-sm:text-sm">{term}</dt>
        <dd className="min-w-0 break-words text-kumo-strong">{value}</dd>
      </div>
    ))}
  </dl>
);

type Problem = "list" | "connection" | "nobody" | "address" | "already";

type FactRows = readonly (readonly [string, React.ReactNode])[];

const audienceFacts = (campaign: Campaign, list: List | null) => {
  const listFact =
    list === null ? <Missing>The list was deleted</Missing> : list.name;

  if (campaign.status !== "draft") {
    return [
      ["List", listFact],
      campaign.status === "sent"
        ? ["Sent to", sentTo(campaign)]
        : ["Sending to", contacts(campaign.recipients.total)],
    ] satisfies FactRows;
  }

  if (list === null) {
    return [["List", listFact]] satisfies FactRows;
  }

  const { subscribed } = list.subscriptions;

  return [
    ["List", listFact],
    [
      "Subscribed now",
      subscribed === 0 ? <Missing>No one yet</Missing> : contacts(subscribed),
    ],
  ] satisfies FactRows;
};

const senderFacts = (
  campaign: Campaign,
  connection: ProviderConnection | undefined
) =>
  [
    [
      "From",
      <span className="block" key="from">
        {campaign.from.name ?? null}
        <span
          className={
            campaign.from.name === undefined
              ? "block"
              : "block text-sm text-kumo-subtle"
          }
        >
          {campaign.from.email}
        </span>
      </span>,
    ],
    [
      "Reply-to",
      campaign.replyTo ?? (
        <span className="text-kumo-subtle">The from email</span>
      ),
    ],
    [
      campaign.status === "draft" ? "Goes through" : "Went through",
      connection === undefined ? (
        <Missing>The connection was deleted</Missing>
      ) : (
        connection.name
      ),
    ],
  ] satisfies FactRows;

const problemOf = (
  campaign: Campaign,
  list: List | null,
  connection: ProviderConnection | undefined,
  organization: Organization,
  refusal: SendRefusal | undefined
) => {
  if (refusal === "already") {
    return "already" satisfies Problem;
  }

  if (campaign.status !== "draft") {
    return;
  }

  if (list === null) {
    return "list" satisfies Problem;
  }

  if (connection === undefined || refusal === "connection") {
    return "connection" satisfies Problem;
  }

  if (organization.postalAddress === null || refusal === "address") {
    return "address" satisfies Problem;
  }

  if (list.subscriptions.subscribed === 0 || refusal === "nobody") {
    return "nobody" satisfies Problem;
  }
};

const ADDRESS_SLOT = "Your postal address goes here";

const DASHED_SLOT =
  "display:inline-block;padding:2px 10px;border:1.5px dashed #a1a1aa;border-radius:6px";

// WARNING: the slot is the preview's own and is never sent; `withFooterHtml` leaves its plain text as it is, so it's found by that text and drawn as the dashed missing piece.
const asSent = (campaign: Campaign, organization: Organization) => {
  if (organization.postalAddress === null) {
    return withFooterHtml(campaign.html, {
      addressLine: ADDRESS_SLOT,
      preferencesUrl: "#",
      unsubscribeUrl: "#",
    }).replace(
      `>${ADDRESS_SLOT}</p>`,
      `><span style="${DASHED_SLOT}">${ADDRESS_SLOT}</span></p>`
    );
  }

  return withFooterHtml(campaign.html, {
    addressLine: postalAddressLine(
      organization.name,
      organization.postalAddress
    ),
    preferencesUrl: "#",
    unsubscribeUrl: "#",
  });
};

const alreadySentWhen = (campaign: Campaign) => {
  if (campaign.status === "sent" && campaign.sentAt !== null) {
    return `It was sent ${formatMoment(campaign.sentAt)}`;
  }

  if (campaign.sendingStartedAt === null) {
    return "It started sending";
  }

  return `It started sending ${formatMoment(campaign.sendingStartedAt)}`;
};

const ProblemBanner = ({
  campaign,
  list,
  organization,
  problem,
}: {
  campaign: Campaign;
  list: List | null;
  organization: Organization;
  problem: Problem;
}) => {
  if (problem === "already") {
    const when = alreadySentWhen(campaign);

    return (
      <Banner
        description={`${when}, from another tab or by someone else in ${organization.name}. It wasn’t sent again.`}
        title={
          campaign.status === "sent"
            ? "This campaign had already been sent"
            : "This campaign was already sending"
        }
      />
    );
  }

  const blocked = {
    address: {
      description: `Every campaign ends with ${organization.name}’s postal address, as anti-spam laws require. Add it once in Organization settings.`,
      title: "Add a postal address before sending",
    },
    connection: {
      description:
        "The provider connection this draft went through was deleted. Edit the draft to choose another.",
      title: "Choose a provider connection before sending",
    },
    list: {
      description:
        "The list this draft went to was deleted. Edit the draft to choose another.",
      title: "Choose a list before sending",
    },
    nobody: {
      description:
        list === null || list.subscriptions.subscribed === 0
          ? `No contacts are subscribed to ${list?.name ?? "its list"}. Add some to it, or edit the draft to choose another list.`
          : `Everyone subscribed to ${list.name} has stopped all marketing email or has a suppressed address. Add contacts to it, or edit the draft to choose another list.`,
      title: "No one to send to yet",
    },
  }[problem];

  return (
    <Banner
      description={blocked.description}
      title={blocked.title}
      variant="alert"
    />
  );
};

const EditLink = ({
  href,
  variant,
}: {
  href: string;
  variant: "primary" | "secondary";
}) => (
  <LinkButton href={href} icon={PencilSimpleIcon} variant={variant}>
    Edit
  </LinkButton>
);

const BlockedActions = ({
  editHref,
  problem,
}: {
  editHref: string;
  problem: Problem;
}) =>
  problem === "address" ? (
    <>
      <EditLink href={editHref} variant="secondary" />
      <LinkButton href="/settings" variant="primary">
        Add postal address
      </LinkButton>
    </>
  ) : (
    <EditLink href={editHref} variant="primary" />
  );

interface Refused {
  readonly reason: SendRefusal;
  readonly connections: readonly ProviderConnection[];
  readonly list: List | null;
  readonly organization: Organization;
}

const stillHolds = (
  refused: Refused,
  list: List | null,
  connections: readonly ProviderConnection[],
  organization: Organization
) => {
  if (refused.reason === "already") {
    return true;
  }

  if (refused.reason === "address") {
    return refused.organization === organization;
  }

  return refused.list === list && refused.connections === connections;
};

// WARNING: a refusal other than "already sent" holds only until what it was about loads again (the List or connections, or the Organization for its postal address); after that the page goes by them, or a List that gained subscribers would stay blocked.
const stillRefused = (
  refused: Refused | undefined,
  list: List | null,
  connections: readonly ProviderConnection[],
  organization: Organization
) =>
  refused !== undefined && stillHolds(refused, list, connections, organization)
    ? refused.reason
    : undefined;

const CampaignView = ({
  campaign,
  connections,
  list,
  onRefusal,
  organization,
}: {
  campaign: Campaign;
  connections: readonly ProviderConnection[];
  list: List | null;
  onRefusal: () => void;
  organization: Organization;
}) => {
  const [refused, setRefused] = useState<Refused>();
  const refusal = stillRefused(refused, list, connections, organization);

  const sending = useDialog();
  const sendButton = useRef<HTMLButtonElement>(null);
  const statusLine = useRef<HTMLSpanElement>(null);
  const problemRegion = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const connection = connections.find(
    (candidate) => candidate.id === campaign.providerConnectionId
  );

  const connectionName = connection?.name ?? "the provider";
  const problem = problemOf(campaign, list, connection, organization, refusal);
  const draft = campaign.status === "draft";
  const editHref = `/campaigns/${campaign.id}/edit`;

  let actions: React.ReactNode;

  if (draft && problem !== undefined) {
    actions = <BlockedActions editHref={editHref} problem={problem} />;
  } else if (draft) {
    actions = (
      <>
        <EditLink href={editHref} variant="secondary" />
        <Button
          icon={PaperPlaneTiltIcon}
          onClick={() => {
            returnFocus.current = sendButton.current;
            sending.setOpen(true);
          }}
          ref={sendButton}
          variant="primary"
        >
          Send now
        </Button>
      </>
    );
  }

  return (
    <PageFrame>
      <div className="mq-capped">
        <PageHeader
          actions={actions}
          crumbs={CRUMBS}
          description={
            <StatusLine
              campaign={campaign}
              connectionName={connectionName}
              ref={statusLine}
            />
          }
          title={campaign.subject}
          titleRunsToActions
        />
        <div
          className="outline-none empty:hidden [&:not(:empty)]:mb-7 [&>*]:w-full"
          ref={problemRegion}
          tabIndex={-1}
        >
          {problem === undefined ? null : (
            <ProblemBanner
              campaign={campaign}
              list={list}
              organization={organization}
              problem={problem}
            />
          )}
        </div>
        <div className="flex flex-col">
          <SettingsSection
            about={
              draft
                ? "Everyone subscribed to the list at the moment you send, except anyone who stopped all marketing email or whose address is suppressed. Pending and unsubscribed contacts don’t get it."
                : "The contacts subscribed to the list when it was sent. Anyone who subscribes later doesn’t get it."
            }
            title={draft ? "Who gets it" : "Who got it"}
          >
            <Facts rows={audienceFacts(campaign, list)} />
          </SettingsSection>
          <SettingsSection
            about="Who it says it’s from, and the provider connection it goes out through."
            title="From"
          >
            <Facts rows={senderFacts(campaign, connection)} />
          </SettingsSection>
          <SettingsSection
            about={
              draft
                ? "The email exactly as it’s sent, in a preview that runs no scripts."
                : "The email as it went out, in a preview that runs no scripts. Its footer shows your postal address as it is now."
            }
            title="Email"
          >
            <EmailPreview
              className="h-[38rem]"
              fit
              html={asSent(campaign, organization)}
            />
          </SettingsSection>
        </div>
      </div>
      <SendCampaignDialog
        campaign={campaign}
        connectionName={connectionName}
        finalFocus={returnFocus}
        key={sending.key}
        listName={list?.name ?? "its list"}
        onExited={sending.handleExited}
        onOpenChange={sending.handleOpenChange}
        onRefused={(reason) => {
          setRefused({ connections, list, organization, reason });
          onRefusal();
          returnFocus.current = problemRegion.current;
          sending.setOpen(false);
        }}
        onSent={() => {
          setRefused(undefined);
          returnFocus.current = statusLine.current;
          sending.setOpen(false);
        }}
        open={sending.open}
        organization={organization}
        subscribed={list?.subscriptions.subscribed ?? 0}
      />
    </PageFrame>
  );
};

/**
 * One Campaign, read-only, in the same sections as its form: who it goes to,
 * who it's from and through which connection, and the email as it's sent.
 * A draft is sent from here, after a confirmation; while it sends, the page
 * asks again every couple of seconds, and its one status line moves on to
 * Sent, with a toast if the page was open when it finished. Whatever stops a
 * draft from being sent is said above its sections, with Edit in Send now's
 * place.
 */
export const CampaignPage = ({
  campaignId,
  organization,
}: {
  campaignId: CampaignId;
  organization: Organization;
}) => {
  const campaign = useCampaign(organization.id, campaignId);
  const connections = useProviderConnections(organization.id);
  const list = useList(organization.id, campaign.data?.listId);
  const toasts = useConfirmationToast();
  const refreshPages = useRefreshCampaignPages(organization.id);
  const seenStatus = useRef(campaign.data?.status);
  const status = campaign.data?.status;

  // WARNING: only a send this page watched finish gets a toast; a Campaign opened already sent doesn't.
  useEffect(() => {
    const finished = seenStatus.current === "sending" && status === "sent";
    seenStatus.current = status;

    if (!finished || campaign.data === undefined || campaign.data === null) {
      return;
    }

    const name = connections.data?.find(
      (candidate) => candidate.id === campaign.data?.providerConnectionId
    )?.name;

    toasts.add({
      description:
        list.data === undefined || list.data === null || name === undefined
          ? undefined
          : `${list.data.name}, through ${name}`,
      title: `Sent to ${sentTo(campaign.data)}`,
    });
    refreshPages();
  }, [
    campaign.data,
    connections.data,
    list.data,
    refreshPages,
    status,
    toasts,
  ]);

  const waiting =
    loadingFirstTime(campaign) ||
    loadingFirstTime(connections) ||
    (campaign.data !== undefined &&
      campaign.data !== null &&
      loadingFirstTime(list));

  if (waiting) {
    return <PageAreaLoading label="Loading the campaign" />;
  }

  if (campaign.data === null) {
    return (
      <PageFrame>
        <div className="mq-capped">
          <PageHeader
            crumbs={CRUMBS}
            description={ABOUT_THE_PAGE}
            title="Campaign"
          />
          <TableRegion label="Campaign">
            <EmptyState
              actions={
                <LinkButton href="/campaigns" variant="primary">
                  Go to Campaigns
                </LinkButton>
              }
              description={`${organization.name} has no such campaign. It may belong to another organization, or the link is out of date.`}
              title="This campaign isn’t here"
            />
          </TableRegion>
        </div>
      </PageFrame>
    );
  }

  if (
    campaign.data === undefined ||
    connections.data === undefined ||
    list.data === undefined
  ) {
    return (
      <PageFrame>
        <div className="mq-capped">
          <PageHeader
            crumbs={CRUMBS}
            description={ABOUT_THE_PAGE}
            title="Campaign"
          />
          <TableRegion label="Campaign">
            <LoadFailed
              onRetry={() => {
                for (const query of [campaign, connections, list]) {
                  if (query.isError) {
                    query.refetch();
                  }
                }
              }}
              retrying={
                campaign.isFetching || connections.isFetching || list.isFetching
              }
              title="This campaign didn’t load"
            />
          </TableRegion>
        </div>
      </PageFrame>
    );
  }

  return (
    <CampaignView
      campaign={campaign.data}
      connections={connections.data}
      list={list.data}
      onRefusal={() => {
        campaign.refetch();
        connections.refetch();
        list.refetch();
      }}
      organization={organization}
    />
  );
};
