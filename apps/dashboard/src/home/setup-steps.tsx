import { LinkButton } from "@cloudflare/kumo";
import { OrganizationIdSchema } from "@repo/domain";
import type { SendingDomain } from "@repo/domain";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { loadingFirstTime } from "../api.ts";
import { StepBlock, StepSeam } from "../brand/quilt-block.tsx";
import type { StepState } from "../brand/quilt-block.tsx";
import { useSendingDomains } from "../domains/domains-api.ts";
import { PlusIcon } from "../icons/icons.tsx";
import { LoadFailed } from "../layout/empty-state.tsx";
import { CreateOrganizationForm } from "../organizations/create-organization-form.tsx";
import { OrganizationPatch } from "../organizations/organization-patch.tsx";
import {
  useCreateOrganization,
  useOrganizations,
} from "../organizations/organizations.tsx";
import { YOUR_ROLE } from "../organizations/roles.tsx";
import { useProviderConnections } from "../providers/providers-api.ts";

interface SetupStep {
  readonly title: string;
  readonly about: string;
  readonly youllNeed?: string;
  readonly built: boolean;
}

const SETUP_STEPS: readonly SetupStep[] = [
  {
    about:
      "It holds one brand’s contacts, campaigns and sending settings. Send for several brands? You can add the others later.",
    built: true,
    title: "Name your organization",
  },
  {
    about:
      "Mailquilt sends through your own account, at your provider’s price.",
    built: true,
    title: "Connect your sending provider",
    youllNeed: "your SMTP server’s host, port and sign-in, from your provider.",
  },
  {
    about:
      "Gmail and Yahoo reject email from a domain whose DKIM and DMARC records don’t pass, so Campaigns are sent only from one that does.",
    built: true,
    title: "Verify your sending domain",
    youllNeed:
      "the DKIM selectors your provider gave you, and access to your domain’s DNS.",
  },
  {
    about: "Bring your audience over from the tool you use today.",
    built: false,
    title: "Import your contacts",
    youllNeed: "a CSV exported from your current tool.",
  },
  {
    about: "Write it, choose who gets it, and send it.",
    built: false,
    title: "Send your first campaign",
    youllNeed: "a list with subscribed contacts, and your email as HTML.",
  },
];

const stateOf = (step: SetupStep, index: number, doneCount: number) => {
  if (index < doneCount) {
    return "done";
  }

  if (index > doneCount) {
    return "later";
  }

  return step.built ? "next" : "waiting";
};

const focusWhenShown = (element: HTMLElement | null) => {
  element?.focus();
};

const INLINE_LINK =
  "font-medium whitespace-nowrap text-kumo-strong underline underline-offset-3";

const NameOrganization = () => {
  const { active } = useOrganizations();
  const create = useCreateOrganization();
  const [justCreated, setJustCreated] = useState(false);

  if (active) {
    return (
      <p
        className="mt-1 flex items-start gap-2 text-base text-kumo-default outline-none"
        ref={justCreated ? focusWhenShown : undefined}
        tabIndex={-1}
      >
        <span className="flex h-lh items-center">
          <OrganizationPatch className="size-3.5" organizationId={active.id} />
        </span>
        <span className="min-w-0 break-words">
          <span className="font-medium text-kumo-strong">{active.name}</span> is
          ready, and you’re {YOUR_ROLE[active.role]}.
        </span>
      </p>
    );
  }

  return (
    <div className="mt-3 max-w-120">
      <CreateOrganizationForm
        create={create}
        layout="step"
        onCreated={() => setJustCreated(true)}
      />
    </div>
  );
};

const ProviderConnected = ({ name }: { name: string }) => (
  <p className="mt-1 text-base text-kumo-default">
    <span className="font-medium text-kumo-strong">{name}</span> is connected.{" "}
    <Link className={INLINE_LINK} to="/providers">
      Manage it in Providers
    </Link>
  </p>
);

const DomainReady = ({ domain }: { domain: string }) => (
  <p className="mt-1 text-base text-kumo-default">
    <span className="font-medium text-kumo-strong">{domain}</span> is ready to
    send from.{" "}
    <Link className={INLINE_LINK} to="/domains">
      Manage it in Domains
    </Link>
  </p>
);

const DomainDone = ({
  readyDomain,
  state,
}: {
  readyDomain?: string;
  state: StepState;
}) =>
  state === "done" && readyDomain !== undefined ? (
    <DomainReady domain={readyDomain} />
  ) : null;

const DomainAction = ({ unready }: { unready?: SendingDomain }) =>
  unready === undefined ? (
    <LinkButton
      className="mt-3.5 w-fit"
      href="/domains/new"
      icon={PlusIcon}
      variant="primary"
    >
      Add your domain
    </LinkButton>
  ) : (
    <>
      <p className="max-w-[36rem] text-base text-pretty text-kumo-default">
        <span className="font-medium text-kumo-strong">{unready.domain}</span>{" "}
        is added, and needs its DNS records to pass.
      </p>
      <LinkButton
        className="mt-3.5 w-fit"
        href={`/domains/${unready.id}`}
        variant="primary"
      >
        See its DNS records
      </LinkButton>
    </>
  );

const YoullNeed = ({ children }: { children: string }) => (
  <p className="max-w-[36rem] text-base text-pretty text-kumo-subtle">
    <span className="font-semibold text-kumo-default">You’ll need</span>{" "}
    {children}
  </p>
);

const NotBuiltYet = () => (
  <p className="mt-2.5 max-w-[36rem] rounded-lg bg-kumo-elevated px-3.5 py-3 text-base text-pretty text-kumo-default ring ring-kumo-hairline">
    This step arrives in a later Mailquilt update. Until then, you can{" "}
    <Link className={INLINE_LINK} to="/contacts">
      add contacts
    </Link>
    ,{" "}
    <Link className={INLINE_LINK} to="/lists">
      make lists
    </Link>{" "}
    and{" "}
    <span className="whitespace-nowrap">
      <Link className={INLINE_LINK} to="/campaigns">
        send a campaign
      </Link>
      .
    </span>
  </p>
);

const STEP_LOOK: Record<
  StepState,
  { row: string; text: string; title: string; titleNote: string }
> = {
  done: {
    row: "pb-7",
    text: "pt-2 max-sm:pt-1",
    title: "text-base font-medium text-kumo-subtle",
    titleNote: ", done: ",
  },
  later: {
    row: "pb-7",
    text: "pt-2 max-sm:pt-1",
    title: "text-base font-semibold text-kumo-default",
    titleNote: ": ",
  },
  next: {
    row: "pb-9",
    text: "flex flex-col gap-1.5 pt-1 max-sm:pt-0.5",
    title:
      "font-display text-display-sm font-semibold text-kumo-strong max-sm:text-xl",
    titleNote: ", next: ",
  },
  waiting: {
    row: "pb-9",
    text: "flex flex-col gap-1.5 pt-1 max-sm:pt-0.5",
    title:
      "font-display text-display-sm font-semibold text-kumo-strong max-sm:text-xl",
    titleNote: ", next: ",
  },
};

const StepRow = ({
  connectedProvider,
  index,
  last,
  readyDomain,
  state,
  step,
  unreadyDomain,
}: {
  connectedProvider?: string;
  readyDomain?: string;
  unreadyDomain?: SendingDomain;
  index: number;
  last: boolean;
  state: StepState;
  step: SetupStep;
}) => {
  const number = index + 1;
  const look = STEP_LOOK[state];
  const isNext = state === "next" || state === "waiting";

  // WARNING: one tree for every state, so NameOrganization isn't remounted here as its step turns done; its `justCreated` focus move needs it to stay mounted.

  return (
    <li
      aria-current={isNext ? "step" : undefined}
      className={`relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-5 max-sm:grid-cols-[2rem_minmax(0,1fr)] max-sm:gap-x-4 ${look.row}`}
    >
      {last ? null : <StepSeam done={state === "done"} />}
      <StepBlock number={number} state={state} />
      <div className={look.text}>
        <h2 className={look.title}>
          <span className="sr-only">
            Step {number}
            {look.titleNote}
          </span>
          {step.title}
        </h2>
        {isNext ? (
          <p className="max-w-[36rem] text-base text-pretty text-(--mq-body)">
            {step.about}
          </p>
        ) : null}
        {index === 0 ? <NameOrganization /> : null}
        {index === 1 && state === "done" && connectedProvider !== undefined ? (
          <ProviderConnected name={connectedProvider} />
        ) : null}
        {index === 2 ? (
          <DomainDone readyDomain={readyDomain} state={state} />
        ) : null}
        {step.youllNeed &&
        (state === "later" ||
          (state === "next" && unreadyDomain === undefined)) ? (
          <div className={state === "later" ? "mt-1" : undefined}>
            <YoullNeed>{step.youllNeed}</YoullNeed>
          </div>
        ) : null}
        {state === "next" && index === 1 ? (
          <LinkButton
            className="mt-3.5 w-fit"
            href="/providers/new"
            icon={PlusIcon}
            variant="primary"
          >
            Connect SMTP server
          </LinkButton>
        ) : null}
        {index === 2 && state === "next" ? (
          <DomainAction unready={unreadyDomain} />
        ) : null}
        {state === "waiting" ? <NotBuiltYet /> : null}
      </div>
    </li>
  );
};

const NO_ORGANIZATION = OrganizationIdSchema.make(
  "org_00000000000000000000000000"
);

/**
 * How many setup steps are done, the first connected provider's name, and
 * the first Sending Domain that can send (or, while none can, the first
 * added), or `undefined` while that isn't known yet, so Home can wait
 * instead of drawing a step as next and then as done. If the connections or
 * domains can't be loaded, Home says its setup didn't load.
 */
export const useSetupProgress = () => {
  const { active } = useOrganizations();

  const connections = useProviderConnections(active?.id ?? NO_ORGANIZATION, {
    enabled: active !== null,
    retryWhenFailed: false,
  });

  const domains = useSendingDomains(active?.id ?? NO_ORGANIZATION, {
    enabled: active !== null,
    retryWhenFailed: false,
  });

  if (!active) {
    return { doneCount: 0 };
  }

  if (loadingFirstTime(connections) || loadingFirstTime(domains)) {
    return;
  }

  if (connections.data === undefined || domains.data === undefined) {
    return {
      doneCount: 1,
      failed: {
        retry: () => {
          for (const query of [connections, domains]) {
            if (query.isError) {
              query.refetch();
            }
          }
        },
        retrying: connections.isFetching || domains.isFetching,
      },
    };
  }

  const [first] = connections.data;

  if (first === undefined) {
    return { doneCount: 1 };
  }

  const ready = domains.data.find((domain) => {
    const status = domain.check?.status;

    return status === "ready" || status === "warning";
  });

  return ready === undefined
    ? {
        connectedProvider: first.name,
        doneCount: 2,
        unreadyDomain: domains.data.at(0),
      }
    : {
        connectedProvider: first.name,
        doneCount: 3,
        readyDomain: ready.domain,
      };
};

/** The five steps from a new account to the first Campaign, in order. */
export const SetupSteps = () => {
  const { connectedProvider, doneCount, failed, readyDomain, unreadyDomain } =
    useSetupProgress() ?? {
      doneCount: 1,
    };

  if (failed !== undefined) {
    return (
      <div className="mt-10">
        <LoadFailed
          onRetry={() => failed.retry()}
          retrying={failed.retrying}
          title="Your setup didn’t load"
        />
      </div>
    );
  }

  return (
    <ol
      aria-label={`Steps to your first campaign, ${doneCount} of ${SETUP_STEPS.length} done`}
      className="mt-10"
    >
      {SETUP_STEPS.map((step, index) => (
        <StepRow
          connectedProvider={connectedProvider}
          readyDomain={readyDomain}
          unreadyDomain={unreadyDomain}
          index={index}
          key={step.title}
          last={index === SETUP_STEPS.length - 1}
          state={stateOf(step, index, doneCount)}
          step={step}
        />
      ))}
    </ol>
  );
};
