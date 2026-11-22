import { Button } from "@cloudflare/kumo";
import type { InstanceStatus } from "@repo/domain";
import { Navigate, useLocation } from "@tanstack/react-router";
import { createContext, useContext } from "react";

import { AuthHeading } from "../layout/auth-layout.tsx";
import { useInstanceStatus } from "./instance-api.ts";

const SETUP_PATH = "/setup";

const InstanceStatusContext = createContext<InstanceStatus | null>(null);

/** Whether setup has run and who may sign up. Only pages inside `SetupGate` can ask. */
export const useInstanceStatusOfGate = () => {
  const status = useContext(InstanceStatusContext);

  if (!status) {
    throw new Error("useInstanceStatusOfGate must be used inside SetupGate");
  }

  return status;
};

/**
 * Every signed-out page waits for the install's status. Until first-run
 * setup has run, every one of them sends the person to setup. While the
 * status loads, the page's frame shows with nothing in it, rather than a form
 * that may be the wrong one.
 */
export const SetupGate = ({ children }: { children: React.ReactNode }) => {
  const { data: status, isFetching, isPending, refetch } = useInstanceStatus();
  const { pathname } = useLocation();

  if (isPending) {
    return null;
  }

  if (!status) {
    return (
      <>
        <AuthHeading description="Check your connection, then try again.">
          Mailquilt couldn’t be reached
        </AuthHeading>
        <Button
          className="w-full justify-center"
          aria-busy={isFetching}
          onClick={() => refetch()}
          size="lg"
          variant="primary"
        >
          {isFetching ? "Trying again…" : "Try again"}
        </Button>
      </>
    );
  }

  if (!status.setUp && pathname !== SETUP_PATH) {
    return <Navigate replace to={SETUP_PATH} />;
  }

  return (
    <InstanceStatusContext value={status}>{children}</InstanceStatusContext>
  );
};
