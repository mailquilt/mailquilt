import { LinkButton } from "@cloudflare/kumo";
import { OrganizationIdSchema } from "@repo/domain";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { StepBlock } from "../brand/quilt-block.tsx";
import type { StepState } from "../brand/quilt-block.tsx";
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
    about: "So inboxes trust that your email really comes from you.",
    built: false,
    title: "Verify your sending domain",
    youllNeed:
      "access to your domain’s DNS, to add the records Mailquilt shows you.",
  },
  {
    about: "Bring your audience over from the tool you use today.",
    built: false,
    title: "Import your contacts",
    youllNeed: "a CSV exported from your current tool.",
  },
  {
    about: "Write it, choose who gets it, and send it now or schedule it.",
    built: false,
    title: "Send your first campaign",
    youllNeed:
      "your postal address for the footer, which anti-spam laws require.",
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
        <span>
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
    </Link>{" "}
    and{" "}
    <span className="whitespace-nowrap">
      <Link className={INLINE_LINK} to="/lists">
        make lists
      </Link>
      .
    </span>
  </p>
);

const Seam = ({ done }: { done: boolean }) => (
  <span
    aria-hidden="true"
    className={`absolute top-10 bottom-0 left-[19px] w-0 border-l-2 max-sm:top-8 max-sm:left-[15px] ${done ? "border-solid border-(--mq-block-ink)" : "border-dashed border-kumo-fill"}`}
  />
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
  state,
  step,
}: {
  connectedProvider?: string;
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
      {last ? null : <Seam done={state === "done"} />}
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
        {step.youllNeed && (state === "later" || state === "next") ? (
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
        {state === "waiting" ? <NotBuiltYet /> : null}
      </div>
    </li>
  );
};

const NO_ORGANIZATION = OrganizationIdSchema.make(
  "org_00000000000000000000000000"
);

/**
 * How many setup steps are done, and the first connected provider's name, or
 * `undefined` while that isn't known yet, so Home can wait instead of drawing
 * a step as next and then as done. If the connections can't be loaded, the
 * provider step stays next; its button still leads to Providers.
 */
export const useSetupProgress = () => {
  const { active } = useOrganizations();

  const connections = useProviderConnections(active?.id ?? NO_ORGANIZATION, {
    enabled: active !== null,
    retryWhenFailed: false,
  });

  if (!active) {
    return { doneCount: 0 };
  }

  if (connections.isPending && connections.errorUpdatedAt === 0) {
    return;
  }

  if (connections.data === undefined) {
    return {
      doneCount: 1,
      failed: {
        retry: () => connections.refetch(),
        retrying: connections.isFetching,
      },
    };
  }

  const [first] = connections.data;

  return first === undefined
    ? { doneCount: 1 }
    : { connectedProvider: first.name, doneCount: 2 };
};

/** The five steps from a new account to the first Campaign, in order. */
export const SetupSteps = () => {
  const { connectedProvider, doneCount, failed } = useSetupProgress() ?? {
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
