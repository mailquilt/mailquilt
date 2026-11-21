import { StepBlock } from "../brand/quilt-block.tsx";

interface SetupStep {
  readonly title: string;
  readonly about: string;
  readonly youllNeed?: string;
}

const SETUP_STEPS: readonly SetupStep[] = [
  {
    about:
      "It holds your contacts, campaigns and sending settings. Most people make one per brand or newsletter.",
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

const NEXT_STEP_UNTIL_ORGANIZATIONS_EXIST = 0;
const DONE_COUNT = 0;

const stateOf = (index: number) =>
  index === NEXT_STEP_UNTIL_ORGANIZATIONS_EXIST ? "next" : "later";

const StepRow = ({ index, step }: { index: number; step: SetupStep }) => {
  const isNext = index === NEXT_STEP_UNTIL_ORGANIZATIONS_EXIST;

  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)] border-b border-kumo-hairline py-7">
      <span className={isNext ? "-mt-0.5" : "-mt-2"}>
        <StepBlock number={index + 1} state={stateOf(index)} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2
          className={`text-lg font-semibold ${isNext ? "text-kumo-strong" : "text-kumo-default"}`}
        >
          <span className="sr-only">Step {index + 1}: </span>
          {step.title}
        </h2>
        <p className="max-w-[36rem] text-base text-(--mq-body)">{step.about}</p>
        {step.youllNeed ? (
          <p className="max-w-[36rem] text-base text-kumo-subtle">
            <span className="font-semibold text-kumo-default">You’ll need</span>{" "}
            {step.youllNeed}
          </p>
        ) : null}
        {isNext ? (
          <p className="mt-3 w-fit rounded-md bg-kumo-tint px-3 py-2 text-base text-kumo-default">
            Organizations arrive in the next Mailquilt update.
          </p>
        ) : null}
      </div>
    </li>
  );
};

/** The five steps from a new account to the first Campaign, in order. */
export const SetupSteps = () => (
  <ol
    aria-label={`Steps to your first campaign, ${DONE_COUNT} of ${SETUP_STEPS.length} done`}
    className="border-t border-kumo-hairline"
  >
    {SETUP_STEPS.map((step, index) => (
      <StepRow index={index} key={step.title} step={step} />
    ))}
  </ol>
);
