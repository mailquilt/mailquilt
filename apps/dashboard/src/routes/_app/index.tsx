import { createFileRoute } from "@tanstack/react-router";

import { SetupSteps } from "../../home/setup-steps.tsx";
import { PageColumn } from "../../layout/page-column.tsx";
import { useAccount } from "../../layout/session-gates.tsx";

const firstName = (name: string) => name.trim().split(/\s+/u)[0] ?? name;

const Home = () => {
  const account = useAccount();

  return (
    <PageColumn>
      <header className="mb-11 flex flex-col gap-4">
        <p className="text-base text-kumo-subtle">
          Welcome to Mailquilt, {firstName(account.name)}.
        </p>
        <h1 className="font-display text-display-xl font-semibold text-balance text-kumo-strong">
          Your first campaign, in five steps.
        </h1>
        <p className="max-w-[34rem] text-base text-(--mq-body)">
          Work down the list in order. What you’ll need for each step is noted,
          so you can gather it now.
        </p>
      </header>
      <SetupSteps />
    </PageColumn>
  );
};

export const Route = createFileRoute("/_app/")({
  component: Home,
  head: () => ({ meta: [{ title: "Home – Mailquilt" }] }),
});
