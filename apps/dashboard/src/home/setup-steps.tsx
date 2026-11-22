import { StepBlock } from "../brand/quilt-block.tsx";
import type { StepState } from "../brand/quilt-block.tsx";
import { CreateOrganizationForm } from "../organizations/create-organization-form.tsx";
import { OrganizationPatch } from "../organizations/organization-patch.tsx";
import {
  useCreateOrganization,
  useOrganizations,
} from "../organizations/organizations.tsx";
import { YOUR_ROLE } from "../organizations/roles.tsx";

interface SetupStep {
  readonly title: string;
  readonly about: string;
  readonly youllNeed?: string;
}

const SETUP_STEPS: readonly SetupStep[] = [
  {
    about:
      "It holds one brand’s contacts, campaigns and sending settings. Send for several brands? You can add the others later.",
    title: "Name your organization",
  },
  {
    about:
      "Mailquilt sends through your own account, at your provider’s price.",
    title: "Connect your sending provider",
    youllNeed:
      "Amazon SES keys allowed to send, or an SMTP host, port and login.",
  },
  {
    about: "So inboxes trust that your email really comes from you.",
    title: "Verify your sending domain",
    youllNeed:
      "access to your domain’s DNS, to add the records Mailquilt shows you.",
  },
  {
    about: "Bring your audience over from the tool you use today.",
    title: "Import your contacts",
    youllNeed: "a CSV exported from your current tool.",
  },
  {
    about: "Write it, choose who gets it, and send it now or schedule it.",
    title: "Send your first campaign",
    youllNeed:
      "your postal address for the footer, which anti-spam laws require.",
  },
];

const stateOf = (index: number, doneCount: number) => {
  if (index < doneCount) {
    return "done";
  }

  return index === doneCount ? "next" : "later";
};

const NameOrganization = () => {
  const { active } = useOrganizations();
  const create = useCreateOrganization();

  if (active) {
    return (
      <p className="flex max-w-[36rem] items-start gap-2 text-base text-(--mq-body)">
        <span className="flex h-lh items-center">
          <OrganizationPatch className="size-4" organizationId={active.id} />
        </span>
        <span>
          <span className="font-medium text-kumo-strong">{active.name}</span> is
          ready, and you’re {YOUR_ROLE[active.role]}.
        </span>
      </p>
    );
  }

  return (
    <div className="mt-3 max-w-[30rem]">
      <CreateOrganizationForm create={create} layout="step" />
    </div>
  );
};

const StepRow = ({
  index,
  state,
  step,
}: {
  index: number;
  state: StepState;
  step: SetupStep;
}) => {
  const isNext = state === "next";

  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)] border-b border-kumo-hairline py-7">
      <span className={isNext ? "-mt-0.5" : "-mt-2"}>
        <StepBlock number={index + 1} state={state} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2
          className={`text-lg font-semibold ${isNext ? "text-kumo-strong" : "text-kumo-default"}`}
        >
          <span className="sr-only">
            Step {index + 1}
            {state === "done" ? ", done" : ""}:{" "}
          </span>
          {step.title}
        </h2>
        <p className="max-w-[36rem] text-base text-(--mq-body)">{step.about}</p>
        {step.youllNeed ? (
          <p className="max-w-[36rem] text-base text-kumo-subtle">
            <span className="font-semibold text-kumo-default">You’ll need</span>{" "}
            {step.youllNeed}
          </p>
        ) : null}
        {index === 0 ? <NameOrganization /> : null}
        {isNext && index > 0 ? (
          <p className="mt-3 w-fit rounded-md bg-kumo-tint px-3 py-2 text-base text-kumo-default">
            This step arrives in a later Mailquilt update.
          </p>
        ) : null}
      </div>
    </li>
  );
};

/** The five steps from a new account to the first Campaign, in order. */
export const SetupSteps = () => {
  const { active } = useOrganizations();
  const doneCount = active ? 1 : 0;

  return (
    <ol
      aria-label={`Steps to your first campaign, ${doneCount} of ${SETUP_STEPS.length} done`}
      className="border-t border-kumo-hairline"
    >
      {SETUP_STEPS.map((step, index) => (
        <StepRow
          index={index}
          key={step.title}
          state={stateOf(index, doneCount)}
          step={step}
        />
      ))}
    </ol>
  );
};
