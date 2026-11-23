import { createFileRoute } from "@tanstack/react-router";

import { SetupSteps, useSetupProgress } from "../../home/setup-steps.tsx";
import { PageFrame } from "../../layout/page-frame.tsx";
import { PageAreaLoading } from "../../layout/page-states.tsx";
import { useAccount } from "../../layout/session-gates.tsx";

const firstName = (name: string) => name.trim().split(/\s+/u)[0] ?? name;

const Home = () => {
  const account = useAccount();
  const progress = useSetupProgress();

  if (progress === undefined) {
    return <PageAreaLoading label="Loading your setup" />;
  }

  return (
    <PageFrame>
      <div className="mx-auto max-w-[40rem] pt-6 max-sm:pt-1">
        <p className="mb-3 text-base text-kumo-subtle">
          Welcome, {firstName(account.name)}.
        </p>
        <h1 className="font-display text-display-lg font-semibold text-balance text-kumo-strong max-sm:text-3xl max-sm:leading-8.5">
          Your first campaign <span className="mq-tone">in five steps</span>
        </h1>
        <p className="mt-3.5 max-w-[36rem] text-base text-pretty text-(--mq-body)">
          Work down the list in order. What you’ll need for each step is noted,
          so you can gather it now.
        </p>
        <SetupSteps />
      </div>
    </PageFrame>
  );
};

export const Route = createFileRoute("/_app/")({
  component: Home,
  head: () => ({ meta: [{ title: "Home – Mailquilt" }] }),
});
