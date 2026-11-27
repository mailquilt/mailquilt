import { Banner, Button, LinkButton } from "@cloudflare/kumo";
import { postalAddressLine, withFooterHtml } from "@repo/domain";
import type {
  Campaign,
  CampaignId,
  List,
  MissedScheduleReason,
  Organization,
  ProviderConnection,
} from "@repo/domain";
import type { UseQueryResult } from "@tanstack/react-query";
import { Predicate } from "effect";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { loadingFirstTime } from "../api.ts";
import { useLists } from "../audience/audience-api.ts";
import { formatCount } from "../audience/format.ts";
import {
  CalendarIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
} from "../icons/icons.tsx";
import { useDialog } from "../layout/action-dialog.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageHeader } from "../layout/page-header.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { SettingsSection } from "../layout/settings-section.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import { useConfirmationToast, useProblemToast } from "../layout/toast.tsx";
import { useProviderConnections } from "../providers/providers-api.ts";
import { formatMoment, formatSince } from "./campaign-dates.ts";
import {
  ListLines,
  listSummary,
  listsInWords,
  namesOf,
} from "./campaign-lists.tsx";
import { CampaignBlock } from "./campaign-status.tsx";
import {
  useCampaign,
  useCancelSchedule,
  useRecipientCount,
  useRefreshCampaignPages,
} from "./campaigns-api.ts";
import { EmailPreview } from "./email-preview.tsx";
import { failedToCount, TryAgain } from "./list-choice.tsx";
import { ScheduleCampaignDialog } from "./schedule-campaign-dialog.tsx";
import {
  cityOf,
  clockIn,
  inZone,
  longDayIn,
  viewerClock,
  viewerZone,
} from "./schedule-time.ts";
import { refusalOf, SendCampaignDialog } from "./send-campaign-dialog.tsx";
import type { SendRefusal } from "./send-campaign-dialog.tsx";

const CRUMBS = [{ href: "/campaigns", label: "Campaigns" }];

const ABOUT_THE_PAGE = "Who a campaign goes to, who it’s from, and the email.";

const contacts = (count: number) =>
  `${formatCount(count)} ${count === 1 ? "contact" : "contacts"}`;

const sentTo = ({ recipients }: Campaign) =>
  recipients.failed === 0
    ? contacts(recipients.total)
    : `${formatCount(recipients.sent)} of ${contacts(recipients.total)}`;

type Schedule = NonNullable<Campaign["schedule"]>;

const scheduledDay = ({ at, timeZone }: Schedule) =>
  `${longDayIn(at, timeZone)} at ${clockIn(at, timeZone)}`;

const scheduledWords = (schedule: Schedule) => {
  const yours = viewerClock(schedule.at, schedule.timeZone);

  return yours === undefined
    ? scheduledDay(schedule)
    : `${scheduledDay(schedule)} in ${cityOf(schedule.timeZone)} (${yours} for you)`;
};

const scheduledWhere = ({ at, timeZone }: Schedule) => {
  const yours = viewerClock(at, timeZone);

  return yours === undefined
    ? `In ${cityOf(viewerZone())}, your time zone.`
    : `In ${cityOf(timeZone)}. That’s ${yours} for you.`;
};

const missedWhen = ({ at, timeZone }: Schedule) =>
  `${clockIn(at, timeZone)} on ${longDayIn(at, timeZone)}${inZone(timeZone)}`;

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

  if (campaign.status === "scheduled" && campaign.schedule !== null) {
    return (
      <>
        <Strong>Scheduled</Strong> for {scheduledWords(campaign.schedule)}.
        Nothing has been sent, and it can’t be edited until you cancel the
        schedule.
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

type Problem = "connection" | "nobody" | "address" | "already";

const isUnsent = (campaign: Campaign) =>
  campaign.status === "draft" || campaign.status === "scheduled";

type FactRows = readonly (readonly [string, React.ReactNode])[];

type RecipientCount = UseQueryResult<number>;

// WARNING: one element for every state, so focus can move to it when Try again leaves the page; a new element per state would leave with it.
const GoesToNow = ({ count }: { count: RecipientCount }) => {
  let shown: React.ReactNode = contacts(count.data ?? 0);

  if (failedToCount(count)) {
    shown = (
      <>
        <Missing>Couldn’t count them</Missing>
        <TryAgain onRetry={() => count.refetch()} retrying={count.isFetching} />
      </>
    );
  } else if (count.isPlaceholderData) {
    shown = <span className="text-kumo-subtle">Counting again…</span>;
  } else if (count.data === 0) {
    shown = <Missing>No one now</Missing>;
  }

  return (
    <span
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 outline-none"
      tabIndex={-1}
    >
      {shown}
    </span>
  );
};

const audienceFacts = (
  campaign: Campaign,
  lists: readonly List[],
  count: RecipientCount
) => {
  const unsent = isUnsent(campaign);

  const rows: (readonly [string, React.ReactNode])[] = [
    [
      {
        draft: "Sends to",
        scheduled: "Sends to",
        sending: "Sending to lists",
        sent: "Sent to lists",
      }[campaign.status],
      <ListLines ids={campaign.listIds} key="to" lists={lists} />,
    ],
  ];

  if (campaign.excludedListIds.length > 0) {
    rows.push([
      unsent ? "Leaves out" : "Left out",
      <ListLines ids={campaign.excludedListIds} key="out" lists={lists} />,
    ]);
  }

  if (unsent) {
    rows.push(["Goes to now", <GoesToNow count={count} key="now" />]);
  } else if (campaign.status === "sending") {
    rows.push(["Sending to", contacts(campaign.recipients.total)]);
  } else {
    rows.push(["Sent to", sentTo(campaign)]);
  }

  return rows satisfies FactRows;
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
      isUnsent(campaign) ? "Goes through" : "Went through",
      connection === undefined ? (
        <Missing>The connection was deleted</Missing>
      ) : (
        connection.name
      ),
    ],
  ] satisfies FactRows;

const problemOf = (
  campaign: Campaign,
  connection: ProviderConnection | undefined,
  organization: Organization,
  count: number | undefined,
  refusal: SendRefusal | undefined
) => {
  // WARNING: CampaignNotDraft also answers a Campaign someone else scheduled; once it has loaded as scheduled, the page says so in its status line, not as "already sending".
  if (refusal === "already" && campaign.status !== "scheduled") {
    return "already" satisfies Problem;
  }

  if (!isUnsent(campaign)) {
    return;
  }

  if (connection === undefined || refusal === "connection") {
    return "connection" satisfies Problem;
  }

  if (organization.postalAddress === null || refusal === "address") {
    return "address" satisfies Problem;
  }

  if (count === 0 || refusal === "nobody") {
    return "nobody" satisfies Problem;
  }
};

const aboutTheAudience = (campaign: Campaign) => {
  if (campaign.status === "scheduled") {
    return "Everyone subscribed to its lists when it starts, once each, except anyone who is or was on a list it leaves out, stopped all marketing email or has a suppressed address. If no one is by then, it isn’t sent and goes back to being a draft.";
  }

  return campaign.status === "draft"
    ? "Everyone subscribed to its lists at the moment you send, once each, except anyone who is or was on a list it leaves out, stopped all marketing email or has a suppressed address."
    : "The contacts it went to when it was sent, once each. Anyone who subscribed later doesn’t get it.";
};

const aboutTheEmail = (campaign: Campaign) => {
  if (campaign.status === "scheduled") {
    return "The email exactly as it’s sent, in a preview that runs no scripts. To change it, cancel the schedule, then edit it.";
  }

  return campaign.status === "draft"
    ? "The email exactly as it’s sent, in a preview that runs no scripts."
    : "The email as it went out, in a preview that runs no scripts. Its footer shows your postal address as it is now.";
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

const nobodyWhy = (campaign: Campaign, lists: readonly List[]) => {
  const names = listsInWords(namesOf(campaign.listIds, lists));

  const anyoneSubscribed = lists.some(
    (list) =>
      campaign.listIds.includes(list.id) && list.subscriptions.subscribed > 0
  );

  return anyoneSubscribed
    ? `Everyone subscribed to ${names} is or was on a list it leaves out, stopped all marketing email, or has a suppressed address. Add contacts, or edit the draft to choose other lists.`
    : `No contacts are subscribed to ${names}. Add some, or edit the draft to choose other lists.`;
};

const ProblemBanner = ({
  campaign,
  lists,
  organization,
  problem,
}: {
  campaign: Campaign;
  lists: readonly List[];
  organization: Organization;
  problem: Problem;
}) => {
  if (problem === "already") {
    const when = alreadySentWhen(campaign);

    const startedOnSchedule =
      campaign.status !== "draft" && campaign.schedule !== null;

    return (
      <Banner
        description={
          startedOnSchedule
            ? `${when}, at the time it was scheduled for.`
            : `${when}, from another tab or by someone else in ${organization.name}. It wasn’t sent again.`
        }
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
    nobody: {
      description: nobodyWhy(campaign, lists),
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

const MISSED_AS_PROBLEM = {
  "no-provider-connection": "connection",
  "no-subscribed-contacts": "nobody",
} as const satisfies Record<MissedScheduleReason, Problem>;

const MissedBanner = ({
  campaign,
  counted,
  lists,
  schedule,
  stillHolds,
}: {
  campaign: Campaign;
  counted: number | undefined;
  lists: readonly List[];
  schedule: Schedule;
  stillHolds: boolean;
}) => {
  const title = `It wasn’t sent at ${missedWhen(schedule)}`;

  const why =
    schedule.missed === "no-provider-connection"
      ? "Its provider connection was deleted before then, so it went back to being a draft."
      : "No one would have got it then, so it went back to being a draft.";

  if (stillHolds) {
    const what =
      schedule.missed === "no-provider-connection"
        ? "Edit it to choose another connection, then schedule it again or send it now."
        : nobodyWhy(campaign, lists);

    return (
      <Banner description={`${why} ${what}`} title={title} variant="alert" />
    );
  }

  const now =
    schedule.missed === "no-subscribed-contacts" && counted !== undefined
      ? `${contacts(counted)} would get it now: schedule it again, or send it now.`
      : "Schedule it again, or send it now.";

  return <Banner description={`${why} ${now}`} title={title} />;
};

const ScheduledProblemBanner = ({
  campaign,
  lists,
  organization,
  problem,
  schedule,
}: {
  campaign: Campaign;
  lists: readonly List[];
  organization: Organization;
  problem: Exclude<Problem, "already">;
  schedule: Schedule;
}) => {
  const said = {
    address: {
      description: `Every campaign ends with ${organization.name}’s postal address, as anti-spam laws require. Add it once in Organization settings.`,
      title: `It won’t be sent at ${missedWhen(schedule)} without a postal address`,
    },
    connection: {
      description:
        "Its provider connection was deleted. Cancel the schedule, then edit it to choose another, or it goes back to being a draft at its time.",
      title: `It won’t be sent at ${missedWhen(schedule)}`,
    },
    nobody: {
      description: `If no one is subscribed to ${listsInWords(namesOf(campaign.listIds, lists))} by then, it isn’t sent and goes back to being a draft. Add contacts, or cancel the schedule and edit it to choose other lists.`,
      title: "No one would get it now",
    },
  }[problem];

  return (
    <Banner description={said.description} title={said.title} variant="alert" />
  );
};

// WARNING: one banner at most: a missed schedule's note takes the place of the problem that made it miss while that problem still holds, but a different problem since then is the one to show.
const PageBanner = ({
  campaign,
  counted,
  lists,
  organization,
  problem,
}: {
  campaign: Campaign;
  counted: number | undefined;
  lists: readonly List[];
  organization: Organization;
  problem: Problem | undefined;
}) => {
  const { schedule } = campaign;

  if (
    campaign.status === "scheduled" &&
    schedule !== null &&
    problem !== undefined &&
    problem !== "already"
  ) {
    return (
      <ScheduledProblemBanner
        campaign={campaign}
        lists={lists}
        organization={organization}
        problem={problem}
        schedule={schedule}
      />
    );
  }

  const missed =
    campaign.status === "draft" ? (schedule?.missed ?? null) : null;

  const stillHolds =
    missed !== null &&
    problem !== undefined &&
    problem === MISSED_AS_PROBLEM[missed];

  if (
    schedule !== null &&
    missed !== null &&
    (problem === undefined || stillHolds)
  ) {
    return (
      <MissedBanner
        campaign={campaign}
        counted={counted}
        lists={lists}
        schedule={schedule}
        stillHolds={stillHolds}
      />
    );
  }

  return problem === undefined ? null : (
    <ProblemBanner
      campaign={campaign}
      lists={lists}
      organization={organization}
      problem={problem}
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

interface Loaded {
  readonly connections: readonly ProviderConnection[];
  readonly countedAt: number;
  readonly organization: Organization;
}

interface Refused extends Loaded {
  readonly reason: SendRefusal;
}

const stillHolds = (refused: Refused, loaded: Loaded) => {
  if (refused.reason === "already") {
    return true;
  }

  if (refused.reason === "address") {
    return refused.organization === loaded.organization;
  }

  if (refused.reason === "nobody") {
    return refused.countedAt === loaded.countedAt;
  }

  return refused.connections === loaded.connections;
};

// WARNING: a refusal other than "already sent" holds only until what it was about loads again (the recipient count, the connections, or the Organization for its postal address); after that the page goes by them, or Lists that gained subscribers would stay blocked.
const stillRefused = (refused: Refused | undefined, loaded: Loaded) =>
  refused !== undefined && stillHolds(refused, loaded)
    ? refused.reason
    : undefined;

const CampaignView = ({
  campaign,
  connections,
  count,
  lists,
  onRefusal,
  organization,
}: {
  campaign: Campaign;
  connections: readonly ProviderConnection[];
  count: RecipientCount;
  lists: readonly List[];
  onRefusal: () => void;
  organization: Organization;
}) => {
  const [refused, setRefused] = useState<Refused>();

  const loaded: Loaded = {
    connections,
    countedAt: count.dataUpdatedAt,
    organization,
  };

  // WARNING: a count that failed to refresh, or one kept from other Lists, is no count; going by it would block or confirm a send on a number that isn't current.
  const counted =
    failedToCount(count) || count.isPlaceholderData ? undefined : count.data;

  const refusal = stillRefused(refused, loaded);

  const sending = useDialog();
  const scheduling = useDialog();
  const sendButton = useRef<HTMLButtonElement>(null);
  const scheduleButton = useRef<HTMLButtonElement>(null);
  const statusLine = useRef<HTMLSpanElement>(null);
  const problemRegion = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const connection = connections.find(
    (candidate) => candidate.id === campaign.providerConnectionId
  );

  const connectionName = connection?.name ?? "the provider";

  const problem = problemOf(
    campaign,
    connection,
    organization,
    counted,
    refusal
  );

  const draft = campaign.status === "draft";
  const unsent = isUnsent(campaign);
  const editHref = `/campaigns/${campaign.id}/edit`;
  const toasts = useConfirmationToast();
  const cancelling = useCancelSchedule(organization.id, campaign.id);
  const cancelProblem = useProblemToast(`cancel-schedule-${campaign.id}`);

  const refuse = (reason: SendRefusal) => {
    setRefused({ ...loaded, reason });
    onRefusal();
  };

  const openSchedule = () => {
    returnFocus.current = scheduleButton.current;
    scheduling.setOpen(true);
  };

  const cancelSchedule = () => {
    const was = campaign.schedule;

    if (cancelling.isPending || was === null) {
      return;
    }

    cancelling.mutate(undefined, {
      onError: (error) => {
        const reason = refusalOf(error);

        if (reason !== undefined) {
          refuse(reason);
          problemRegion.current?.focus();

          return;
        }

        cancelProblem.show({
          description: Predicate.isTagged(error, "SignInRequired")
            ? "You’ve been signed out. Sign in again, then cancel it."
            : "Mailquilt couldn’t reach its server. Check your connection, then try again.",
          title: "It’s still scheduled",
        });
      },
      onSuccess: () => {
        cancelProblem.clear();
        setRefused(undefined);
        toasts.add({
          description: `It was set for ${missedWhen(was)}. It’s a draft again, and nothing was sent.`,
          title: "Schedule cancelled",
        });
        statusLine.current?.focus();
      },
    });
  };

  let actions: React.ReactNode;

  if (campaign.status === "scheduled") {
    actions = (
      <>
        <Button onClick={cancelSchedule} variant="secondary">
          {cancelling.isPending ? "Cancelling…" : "Cancel schedule"}
        </Button>
        <Button
          icon={CalendarIcon}
          onClick={openSchedule}
          ref={scheduleButton}
          variant="secondary"
        >
          Change time
        </Button>
      </>
    );
  } else if (draft && problem !== undefined) {
    actions = <BlockedActions editHref={editHref} problem={problem} />;
  } else if (draft) {
    actions = (
      <>
        <EditLink href={editHref} variant="secondary" />
        <Button
          icon={CalendarIcon}
          onClick={openSchedule}
          ref={scheduleButton}
          variant="secondary"
        >
          Schedule
        </Button>
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
          <PageBanner
            campaign={campaign}
            counted={counted}
            lists={lists}
            organization={organization}
            problem={problem}
          />
        </div>
        <div className="flex flex-col">
          <SettingsSection
            about={aboutTheAudience(campaign)}
            title={unsent ? "Who gets it" : "Who got it"}
          >
            <Facts rows={audienceFacts(campaign, lists, count)} />
          </SettingsSection>
          <SettingsSection
            about="Who it says it’s from, and the provider connection it goes out through."
            title="From"
          >
            <Facts rows={senderFacts(campaign, connection)} />
          </SettingsSection>
          <SettingsSection about={aboutTheEmail(campaign)} title="Email">
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
        count={counted}
        finalFocus={returnFocus}
        key={sending.key}
        lists={lists}
        onExited={sending.handleExited}
        onOpenChange={sending.handleOpenChange}
        onRefused={(reason) => {
          refuse(reason);
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
      />
      <ScheduleCampaignDialog
        campaign={campaign}
        connectionName={connectionName}
        count={counted}
        finalFocus={returnFocus}
        key={scheduling.key}
        onExited={scheduling.handleExited}
        onOpenChange={scheduling.handleOpenChange}
        onRefused={(reason) => {
          refuse(reason);
          returnFocus.current = problemRegion.current;
          scheduling.setOpen(false);
        }}
        onScheduled={(scheduled) => {
          setRefused(undefined);

          if (scheduled.schedule !== null) {
            toasts.add({
              description: scheduledWhere(scheduled.schedule),
              title: `${campaign.status === "scheduled" ? "Moved to" : "Scheduled for"} ${scheduledDay(scheduled.schedule)}`,
            });
          }

          returnFocus.current = statusLine.current;
          scheduling.setOpen(false);
        }}
        open={scheduling.open}
        organization={organization}
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
  const lists = useLists(organization.id);

  const unsent =
    campaign.data !== undefined &&
    campaign.data !== null &&
    isUnsent(campaign.data);

  const count = useRecipientCount(
    organization.id,
    {
      excludedListIds: campaign.data?.excludedListIds ?? [],
      listIds: campaign.data?.listIds ?? [],
    },
    unsent
  );

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
        lists.data === undefined || name === undefined
          ? undefined
          : `${listSummary(namesOf(campaign.data.listIds, lists.data))}, through ${name}`,
      title: `Sent to ${sentTo(campaign.data)}`,
    });
    refreshPages();
  }, [
    campaign.data,
    connections.data,
    lists.data,
    refreshPages,
    status,
    toasts,
  ]);

  // WARNING: a draft's or scheduled Campaign's page waits for its recipient count too; drawn later, its "No one to send to yet" and Send now would change after the page appeared.
  const waiting =
    loadingFirstTime(campaign) ||
    loadingFirstTime(connections) ||
    loadingFirstTime(lists) ||
    (unsent && loadingFirstTime(count));

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
    lists.data === undefined
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
                for (const query of [campaign, connections, lists]) {
                  if (query.isError) {
                    query.refetch();
                  }
                }
              }}
              retrying={
                campaign.isFetching ||
                connections.isFetching ||
                lists.isFetching
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
      count={count}
      lists={lists.data}
      onRefusal={() => {
        campaign.refetch();
        connections.refetch();
        lists.refetch();
        count.refetch();
      }}
      organization={organization}
    />
  );
};
