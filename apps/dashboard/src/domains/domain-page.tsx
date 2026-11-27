import { Banner, Button, LinkButton } from "@cloudflare/kumo";
import type {
  Organization,
  ProviderConnection,
  SendingDomain,
  SendingDomainId,
} from "@repo/domain";
import { DnsLookupFailed } from "@repo/domain";
import { useNavigate } from "@tanstack/react-router";
import { DateTime, Predicate } from "effect";
import { useEffect, useRef, useState } from "react";

import { loadingFirstTime } from "../api.ts";
import { StepBlock, StepSeam } from "../brand/quilt-block.tsx";
import type { StepState } from "../brand/quilt-block.tsx";
import { useDialog } from "../layout/action-dialog.tsx";
import { Breakable } from "../layout/breakable.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageHeader } from "../layout/page-header.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useProviderConnections } from "../providers/providers-api.ts";
import type { DnsRecordRow, RecordGroup } from "./dns-records.ts";
import {
  checkedWhen,
  recordsOf,
  sesConnectionFor,
  statusOf,
  warningsIn,
} from "./dns-records.ts";
import {
  CopyValue,
  DomainStatusLabel,
  statusWords,
  Found,
  FromProvider,
  MarkBlock,
} from "./domain-status.tsx";
import { useCheckSendingDomain, useSendingDomains } from "./domains-api.ts";
import { DomainMenu, RemoveDomainDialog } from "./remove-domain-dialog.tsx";

const BODY = "text-base text-pretty text-(--mq-body)";

const CHECK_AGAIN_MS = 60_000;

const NOW_EVERY_MS = 30_000;

const GROUPS: readonly RecordGroup[] = ["dkim", "dmarc", "spf"];

const CRUMBS = [{ href: "/domains", label: "Domains" }];

const STEP_NOTE: Record<StepState, string> = {
  done: ", done: ",
  later: ": ",
  next: ", next: ",
  waiting: ", missing: ",
};

const COUNT_WORDS = new Map([
  [3, "three"],
  [4, "four"],
  [5, "five"],
]);

const useNow = () => {
  const [now, setNow] = useState(() => DateTime.nowUnsafe());

  useEffect(() => {
    const timer = setInterval(() => setNow(DateTime.nowUnsafe()), NOW_EVERY_MS);

    return () => clearInterval(timer);
  }, []);

  return now;
};

const stepStates = (records: readonly DnsRecordRow[]) => {
  let nextTaken = false;

  return GROUPS.map((group) => {
    const inGroup = records.filter((record) => record.group === group);
    let state: StepState = "later";

    if (inGroup.every((record) => record.mark === "pass")) {
      state = "done";
    } else if (inGroup.some((record) => record.mark === "fail")) {
      state = nextTaken ? "waiting" : "next";
      nextTaken = true;
    }

    return state;
  });
};

const stepTitle = (
  group: RecordGroup,
  domain: SendingDomain,
  ses: ProviderConnection | undefined
) => {
  if (group === "dkim") {
    return ses === undefined
      ? "Publish your provider’s DKIM keys"
      : "Publish Amazon SES’s DKIM keys";
  }

  if (group === "dmarc") {
    return "Add a DMARC policy";
  }

  return domain.returnPath === null ? "Add SPF" : "Set up the return path";
};

const stepAbout = (
  group: RecordGroup,
  domain: SendingDomain,
  ses: ProviderConnection | undefined
) => {
  const selectors = domain.dkimSelectors.length;

  if (group === "dkim") {
    let each = `all ${COUNT_WORDS.get(selectors) ?? selectors}`;

    if (selectors <= 2) {
      each = selectors === 1 ? "it" : "both";
    }

    return ses === undefined
      ? `Your provider signs your email with ${selectors === 1 ? "this key" : "these keys"}. Add ${each}, with the value your provider gave you.`
      : `Amazon SES signs your email with ${selectors === 1 ? "this key" : "these keys"}, as ${ses.name} sends as ${ses.from.email}. Add ${each}.`;
  }

  if (group === "dmarc") {
    return `Tells inboxes what to do with email that fails DKIM. If other services send email as ${domain.domain}, such as your office email, make sure they sign with DKIM before adding it.`;
  }

  if (domain.returnPath === null) {
    return `Lists who may send email as ${domain.domain}. Without a return path of its own, your provider’s SPF counts for little with DMARC, so it only warns.`;
  }

  return ses === undefined
    ? `Where your provider sends bounces back to. It needs an SPF record, and an MX record so bounces arrive.`
    : `Where SES sends bounces back to, set as the custom MAIL FROM domain on its identity. It needs an SPF record, and an MX record so bounces arrive.`;
};

const Passed = ({ record }: { record: DnsRecordRow }) => (
  <p className="flex items-start gap-2.5 text-sm">
    <span className="flex h-lh items-center">
      <MarkBlock mark="pass" />
    </span>
    <span className="min-w-0 text-kumo-subtle">
      <span className="font-medium text-kumo-default">{record.type}</span>{" "}
      <span className="font-mono text-xs">
        <Breakable value={record.name} />
      </span>{" "}
      passes.
    </span>
  </p>
);

const ToDo = ({ record }: { record: DnsRecordRow }) => (
  <div className="flex min-w-0 flex-col gap-2.5 rounded-xl bg-kumo-base p-4 ring ring-kumo-hairline">
    <Found record={record} />
    <dl className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm max-sm:grid-cols-[minmax(0,1fr)] max-sm:gap-y-1 max-sm:[&_dd]:mb-2">
      <dt className="text-kumo-subtle">Type</dt>
      <dd className="font-medium text-kumo-strong">{record.type}</dd>
      <dt className="text-kumo-subtle">Name</dt>
      <dd className="min-w-0">
        <CopyValue label={`${record.label} name`} text={record.name} />
      </dd>
      <dt className="text-kumo-subtle">Value</dt>
      <dd className="min-w-0">
        {record.value === undefined ? (
          <FromProvider text={record.valueFrom ?? ""} />
        ) : (
          <CopyValue label={`${record.label} value`} text={record.value} />
        )}
      </dd>
    </dl>
  </div>
);

const Steps = ({
  domain,
  records,
  ses,
}: {
  domain: SendingDomain;
  records: readonly DnsRecordRow[];
  ses: ProviderConnection | undefined;
}) => {
  const states = stepStates(records);

  return (
    <ol className="flex flex-col">
      {GROUPS.map((group, index) => {
        const last = index === GROUPS.length - 1;
        const state = states[index] ?? "later";

        return (
          <li
            aria-current={state === "next" ? "step" : undefined}
            className={`relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-5 max-sm:grid-cols-[2rem_minmax(0,1fr)] max-sm:gap-x-4 ${last ? "" : "pb-10"}`}
            key={group}
          >
            {last ? null : <StepSeam done={state === "done"} />}
            <StepBlock number={index + 1} state={state} />
            <div className="flex min-w-0 flex-col gap-3 pt-1.5 max-sm:pt-0.5">
              <h2 className="font-display text-display-xs font-semibold text-kumo-strong">
                <span className="sr-only">
                  Step {index + 1}
                  {STEP_NOTE[state]}
                </span>
                {stepTitle(group, domain, ses)}
                {group === "spf" ? (
                  <span className="font-normal text-kumo-subtle">
                    {" "}
                    (optional)
                  </span>
                ) : null}
              </h2>
              <p className={`max-w-[42rem] ${BODY}`}>
                {stepAbout(group, domain, ses)}
              </p>
              {records
                .filter((record) => record.group === group)
                .map((record) =>
                  record.mark === "pass" ? (
                    <Passed key={record.key} record={record} />
                  ) : (
                    <ToDo key={record.key} record={record} />
                  )
                )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

const checkProblem = (
  error: Error,
  domain: SendingDomain,
  now: DateTime.Utc
) => {
  const since =
    domain.check === null
      ? ""
      : ` The results below are from the last check, ${checkedWhen(domain.check.checkedAt, now)}.`;

  if (error instanceof DnsLookupFailed) {
    return {
      description: `Looking up ${error.name} failed: ${error.detail}${since}`,
      title: "Mailquilt couldn’t check its DNS records",
    };
  }

  if (Predicate.isTagged(error, "SignInRequired")) {
    return {
      description: "Sign in again, then check it.",
      title: "You’ve been signed out",
    };
  }

  return {
    description: `Check your connection, then try again.${since}`,
    title: "Mailquilt couldn’t reach its server",
  };
};

const NotHere = ({ organization }: { organization: Organization }) => (
  <TableRegion label="Domain">
    <EmptyState
      actions={
        <LinkButton href="/domains" variant="primary">
          Go to Domains
        </LinkButton>
      }
      description={`${organization.name} has no such domain. Someone may have removed it, or the link is out of date.`}
      title="This domain isn’t here"
    />
  </TableRegion>
);

const DomainView = ({
  connections,
  domain,
  organization,
}: {
  connections: readonly ProviderConnection[];
  domain: SendingDomain;
  organization: Organization;
}) => {
  const check = useCheckSendingDomain(organization.id, domain.id);
  const removing = useDialog();
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const now = useNow();
  const toasts = useConfirmationToast();

  const records = recordsOf(domain, connections);
  const ses = sesConnectionFor(domain, connections);
  const status = statusOf(domain);
  const ready = status === "ready";
  const { isPending: checking, mutate: checkNow } = check;
  const unchecked = domain.check === null;

  // WARNING: a domain is checked once it's added, so its page never sits on "Not checked yet"; and again every minute while it isn't ready and the page is in view, so records added at the DNS host show up without a click.
  useEffect(() => {
    if (unchecked) {
      checkNow();
    }

    if (ready) {
      return;
    }

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        checkNow();
      }
    }, CHECK_AGAIN_MS);

    return () => clearInterval(timer);
  }, [checkNow, ready, unchecked]);

  // WARNING: an unchecked domain is drawn as being checked from the first paint, as its check starts just after, and only a check that fails says it isn't checked; drawing "Not checked yet" first would flash.
  const firstCheckRunning = unchecked && (checking || check.error === null);

  let checkedLine = firstCheckRunning
    ? "Mailquilt is looking up each record now."
    : "Check now to look its records up.";

  if (domain.check !== null) {
    const when = `Checked ${checkedWhen(domain.check.checkedAt, now)}.`;

    if (checking) {
      checkedLine = `${when} Checking again now…`;
    } else {
      checkedLine = ready
        ? when
        : `${when} Checks again every minute while this page is open.`;
    }
  }

  const failing = records.filter((record) => record.mark === "fail").length;

  const problem =
    check.error === null ? undefined : checkProblem(check.error, domain, now);

  return (
    <PageFrame>
      <div className="mq-capped">
        <PageHeader
          actions={
            <>
              <Button
                aria-disabled={checking || undefined}
                onClick={() => {
                  if (!checking) {
                    checkNow(undefined, {
                      onSuccess: (checked) =>
                        toasts.add({
                          description: statusWords(
                            statusOf(checked),
                            warningsIn(recordsOf(checked, connections))
                          ),
                          title: `Checked ${checked.domain}`,
                        }),
                    });
                  }
                }}
                variant="secondary"
              >
                {checking ? "Checking…" : "Check now"}
              </Button>
              <DomainMenu
                domain={domain}
                onRemove={() => removing.setOpen(true)}
                triggerRef={menuButton}
              />
            </>
          }
          crumbs={CRUMBS}
          description={
            <span className="flex flex-col gap-1">
              <span aria-live="polite">
                <DomainStatusLabel
                  checking={firstCheckRunning}
                  status={status}
                  warnings={warningsIn(records)}
                />
              </span>
              <span className="text-kumo-subtle">{checkedLine}</span>
            </span>
          }
          title={domain.domain}
        />
        <div className="empty:hidden [&:not(:empty)]:mb-8 [&>*]:w-full">
          {problem === undefined ? null : (
            <Banner
              description={problem.description}
              role="alert"
              title={problem.title}
              variant="error"
            />
          )}
          {problem === undefined && status === "blocked" ? (
            <Banner
              description={`Gmail and Yahoo reject email from a domain whose DKIM fails or that has no DMARC record, so Campaigns from ${domain.domain} are held until both pass. Fix ${failing === 1 ? "it" : "them"} at your DNS host.`}
              title={`${failing} ${failing === 1 ? "record needs" : "records need"} fixing`}
              variant="alert"
            />
          ) : null}
        </div>
        <Steps domain={domain} records={records} ses={ses} />
        <p className="mt-8 max-w-[42rem] text-sm text-pretty text-kumo-subtle">
          Some DNS hosts add .{domain.domain} to a name for you. There, enter
          only the part before it, such as _dmarc.
        </p>
      </div>
      <RemoveDomainDialog
        domain={domain}
        finalFocus={menuButton}
        key={removing.key}
        onExited={removing.handleExited}
        onOpenChange={removing.handleOpenChange}
        onRemoved={() =>
          // WARNING: the page, and the ⋯ button focus would go back to, leave with the domain, so focus moves to Domains' page area.
          navigate({ to: "/domains" }).then(() =>
            document.querySelector<HTMLElement>("#main")?.focus()
          )
        }
        open={removing.open}
        organization={organization}
      />
    </PageFrame>
  );
};

/**
 * A Sending Domain's page: the DNS records it needs, in three steps that
 * fill in as checks find them, checked once it's added and every minute
 * while it isn't ready. Waits for the domains and the connections, and
 * draws once.
 */
export const DomainPage = ({
  organization,
  sendingDomainId,
}: {
  organization: Organization;
  sendingDomainId: SendingDomainId;
}) => {
  const domains = useSendingDomains(organization.id);
  const connections = useProviderConnections(organization.id);

  if (loadingFirstTime(domains) || loadingFirstTime(connections)) {
    return <PageAreaLoading label="Loading the domain" />;
  }

  const domain = domains.data?.find(
    (candidate) => candidate.id === sendingDomainId
  );

  if (domains.data === undefined || connections.data === undefined) {
    return (
      <PageFrame>
        <div className="mq-capped">
          <PageHeader
            crumbs={CRUMBS}
            description="The DNS records a domain needs, and what its last check found."
            title="Domain"
          />
          <TableRegion label="Domain">
            <LoadFailed
              onRetry={() => {
                for (const query of [domains, connections]) {
                  if (query.isError) {
                    query.refetch();
                  }
                }
              }}
              retrying={domains.isFetching || connections.isFetching}
              title="This domain didn’t load"
            />
          </TableRegion>
        </div>
      </PageFrame>
    );
  }

  if (domain === undefined) {
    return (
      <PageFrame>
        <div className="mq-capped">
          <PageHeader
            crumbs={CRUMBS}
            description="The DNS records a domain needs, and what its last check found."
            title="Domain"
          />
          <NotHere organization={organization} />
        </div>
      </PageFrame>
    );
  }

  return (
    <DomainView
      connections={connections.data}
      domain={domain}
      organization={organization}
    />
  );
};
