import { Button, ClipboardText, LinkButton } from "@cloudflare/kumo";
import type {
  Organization,
  ProviderConnectionId,
  SesConnection,
} from "@repo/domain";
import { useLayoutEffect, useRef } from "react";

import { loadingFirstTime } from "../api.ts";
import { StepBlock, StepSeam } from "../brand/quilt-block.tsx";
import { ArrowSquareOutIcon, WarningCircleIcon } from "../icons/icons.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageHeader } from "../layout/page-header.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import {
  useProviderConnections,
  useSesNotificationsUrl,
} from "./providers-api.ts";
import { SES_REGIONS } from "./ses-regions.ts";

const BODY = "text-base text-pretty text-(--mq-body)";

// WARNING: SES can publish to a topic only once its access policy allows `ses.amazonaws.com` to; the console doesn't add it, and without it no bounce or complaint ever arrives.
const SES_TOPIC_POLICY_GUIDE =
  "https://docs.aws.amazon.com/ses/latest/dg/configure-sns-notifications.html";

const regionName = (code: string) =>
  SES_REGIONS.find((region) => region.code === code)?.name ?? code;

// WARNING: GovCloud's console is on its own domain; a Region subdomain of console.aws.amazon.com doesn't exist for it.
const consoleUrl = (region: string, path: string) => {
  const host = region.startsWith("us-gov-")
    ? "console.amazonaws-us-gov.com"
    : `${region}.console.aws.amazon.com`;

  return `https://${host}/${path.replace("{region}", region)}`;
};

const ConsoleLink = ({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) => (
  <a
    className="hover:decoration-kumo-strong inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-kumo-strong underline decoration-kumo-hairline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus"
    href={href}
    rel="noopener noreferrer"
    target="_blank"
  >
    {children}
    <ArrowSquareOutIcon aria-hidden="true" className="size-3.5 shrink-0" />
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);

const AddressFailed = ({
  onRetry,
  retrying,
  slot,
}: {
  onRetry: () => void;
  retrying: boolean;
  slot: React.RefObject<HTMLDivElement | null>;
}) => {
  const row = useRef<HTMLDivElement>(null);

  // WARNING: this runs while Try again is still in the page; once the address replaces it, the browser has already dropped its focus to the body.
  useLayoutEffect(() => {
    const node = row.current;
    const target = slot.current;

    return () => {
      if (node?.contains(document.activeElement)) {
        target?.focus();
      }
    };
  }, [slot]);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg px-3 py-2 ring ring-kumo-hairline"
      ref={row}
      role="alert"
    >
      <span className="flex items-start gap-2 text-sm text-kumo-default">
        <span className="flex h-lh items-center">
          <WarningCircleIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-kumo-danger"
          />
        </span>
        The address didn’t load. Check your connection, then try again.
      </span>
      <Button
        aria-disabled={retrying || undefined}
        onClick={() => {
          if (!retrying) {
            onRetry();
          }
        }}
        size="sm"
        variant="secondary"
      >
        {retrying ? "Trying again…" : "Try again"}
      </Button>
    </div>
  );
};

const NotificationsAddress = ({
  address,
}: {
  address: ReturnType<typeof useSesNotificationsUrl>;
}) => {
  const slot = useRef<HTMLDivElement>(null);

  return (
    <div
      className="flex min-w-0 flex-col gap-2 outline-none"
      ref={slot}
      tabIndex={-1}
    >
      {address.data === undefined ? (
        <AddressFailed
          onRetry={() => address.refetch()}
          retrying={address.isFetching}
          slot={slot}
        />
      ) : (
        <>
          <span className="sr-only">The notifications address</span>
          <ClipboardText
            className="w-full min-w-0"
            labels={{
              copyAction: "Copy the address",
              hideAction: "Hide the address",
              revealAction: "Show the address",
            }}
            masked
            text={address.data.url}
            tooltip={{ copiedText: "Copied", text: "Copy" }}
          />
          <p className="text-sm text-pretty text-kumo-subtle">
            Anyone who has this address can post to it, so keep it like a
            password.
          </p>
        </>
      )}
    </div>
  );
};

const Step = ({
  children,
  last = false,
  number,
  title,
}: {
  children: React.ReactNode;
  last?: boolean;
  number: number;
  title: React.ReactNode;
}) => (
  <li
    className={`relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-5 max-sm:grid-cols-[2rem_minmax(0,1fr)] max-sm:gap-x-4 ${last ? "" : "pb-9"}`}
  >
    {last ? null : <StepSeam />}
    <StepBlock number={number} state="later" />
    <div className="flex max-w-[42rem] min-w-0 flex-col gap-3 pt-1.5 max-sm:pt-0.5">
      <h2 className="font-display text-display-xs font-semibold text-kumo-strong">
        <span className="sr-only">Step {number}: </span>
        {title}
      </h2>
      {children}
    </div>
  </li>
);

const Steps = ({
  address,
  connection,
}: {
  address: ReturnType<typeof useSesNotificationsUrl>;
  connection: SesConnection;
}) => {
  const { region } = connection.ses;

  return (
    <ol className="flex flex-col">
      <Step
        number={1}
        title={
          <>
            Create an SNS topic in{" "}
            <span className="whitespace-nowrap">{region}</span>
          </>
        }
      >
        <p className={BODY}>
          In Amazon SNS, create a Standard topic in {regionName(region)}, the
          Region {connection.name} sends from. Any name will do, such as{" "}
          <span className="font-medium text-kumo-default">
            mailquilt-feedback
          </span>
          . Then let SES publish to it: edit the topic, and under Access policy
          allow the service{" "}
          <span className="font-medium text-kumo-default">
            ses.amazonaws.com
          </span>{" "}
          to <span className="font-medium text-kumo-default">sns:Publish</span>,
          as AWS’s example policy shows. Without it, SES can’t send anything to
          the topic.
        </p>
        <span className="flex flex-wrap gap-x-5 gap-y-2">
          <ConsoleLink
            href={consoleUrl(region, "sns/v3/home?region={region}#/topics")}
          >
            Open SNS in {region}
          </ConsoleLink>
          <ConsoleLink href={SES_TOPIC_POLICY_GUIDE}>
            AWS’s example policy
          </ConsoleLink>
        </span>
      </Step>
      <Step number={2} title="Subscribe Mailquilt to the topic">
        <p className={BODY}>
          On the topic, create a subscription with the HTTPS protocol and this
          address as its endpoint, and leave raw message delivery off. Mailquilt
          confirms it by itself. It can’t see your AWS account, though, so check
          that SNS shows the subscription as Confirmed.
        </p>
        <NotificationsAddress address={address} />
      </Step>
      <Step last number={3} title="Send SES’s bounces and complaints to it">
        <p className={BODY}>
          In SES, open each verified identity you send from, such as{" "}
          {connection.from.email.split("@")[1] ?? connection.from.email}. Under
          Notifications, set Bounce feedback and Complaint feedback to the
          topic.
        </p>
        <ConsoleLink
          href={consoleUrl(region, "ses/home?region={region}#/identities")}
        >
          Open SES identities in {region}
        </ConsoleLink>
      </Step>
    </ol>
  );
};

const NotHere = ({
  description,
  title,
}: {
  description: string;
  title: string;
}) => (
  <TableRegion label="Connection">
    <EmptyState
      actions={
        <LinkButton href="/providers" variant="primary">
          Go to Providers
        </LinkButton>
      }
      description={description}
      title={title}
    />
  </TableRegion>
);

/**
 * How to have an SES connection's bounces and complaints reach Mailquilt:
 * three steps in the AWS console, with the connection's notifications
 * address in the second. Waits for the connection and the address, and
 * draws once.
 */
export const BouncesPage = ({
  organization,
  providerConnectionId,
}: {
  organization: Organization;
  providerConnectionId: ProviderConnectionId;
}) => {
  const connections = useProviderConnections(organization.id);

  const connection = connections.data?.find(
    (candidate) => candidate.id === providerConnectionId
  );

  const isSes = connection?.provider === "ses";

  const address = useSesNotificationsUrl(
    organization.id,
    providerConnectionId,
    {
      enabled: isSes,
    }
  );

  if (loadingFirstTime(connections) || (isSes && loadingFirstTime(address))) {
    return <PageAreaLoading label="Loading the connection" />;
  }

  const crumbs = [
    { href: "/providers", label: "Providers" },
    ...(connection === undefined
      ? []
      : [
          {
            href: `/providers/${connection.id}/edit`,
            label: connection.name,
          },
        ]),
  ];

  const ready = connections.data !== undefined && isSes;

  const body = () => {
    if (connections.data === undefined) {
      return (
        <TableRegion label="Connection">
          <LoadFailed
            onRetry={() => connections.refetch()}
            retrying={connections.isFetching}
            title="The connection didn’t load"
          />
        </TableRegion>
      );
    }

    if (connection === undefined) {
      return (
        <NotHere
          description={`${organization.name} has no such connection. Someone may have deleted it.`}
          title="This connection isn’t here"
        />
      );
    }

    if (connection.provider !== "ses") {
      return (
        <NotHere
          description={`${connection.name} is an SMTP server. Mailquilt hears about bounces and complaints from Amazon SES connections.`}
          title="Only Amazon SES reports bounces here"
        />
      );
    }

    return (
      <>
        <Steps address={address} connection={connection} />
        <section
          aria-labelledby="bounces-after"
          className="mt-10 border-t border-kumo-hairline pt-6"
        >
          <h2
            className="font-display text-display-xs font-semibold text-kumo-strong"
            id="bounces-after"
          >
            What Mailquilt does with them
          </h2>
          <p className={`mt-2 max-w-[42rem] ${BODY}`}>
            A hard bounce or a spam complaint Suppresses the address at once,
            and so does a third soft bounce within 7 days. Each shows on
            Suppressions with its reason.
          </p>
          <LinkButton className="mt-4" href="/suppressions" variant="secondary">
            Go to Suppressions
          </LinkButton>
        </section>
      </>
    );
  };

  return (
    <PageFrame>
      <div className="mq-capped">
        <PageHeader
          crumbs={crumbs}
          description={
            ready
              ? "Have SES report them to Mailquilt through Amazon SNS, so addresses that bounce or complain stop getting Campaigns. It takes a few minutes in the AWS console."
              : "How an Amazon SES connection’s bounces and complaints reach Mailquilt."
          }
          title="Bounces and complaints"
        />
        {body()}
      </div>
    </PageFrame>
  );
};
