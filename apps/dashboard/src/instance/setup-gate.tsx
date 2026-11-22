import type { InstanceStatus } from "@repo/domain";
import { Navigate, useLocation } from "@tanstack/react-router";
import { createContext, useContext } from "react";

import { PageLoadFailed, PageLoading } from "../layout/page-states.tsx";
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
 * Waits for the install's status, with the whole page's loader, so a
 * signed-out page draws once. Until first-run setup has run, every
 * signed-out page sends the person to setup.
 */
export const SetupGate = ({ children }: { children: React.ReactNode }) => {
  const { data: status, isPending, refetch } = useInstanceStatus();
  const { pathname } = useLocation();

  if (isPending) {
    return <PageLoading />;
  }

  if (!status) {
    return (
      <PageLoadFailed
        description="Check your connection, then try again."
        onRetry={() => refetch()}
        title="Mailquilt couldn’t be reached"
      />
    );
  }

  if (!status.setUp && pathname !== SETUP_PATH) {
    return <Navigate replace to={SETUP_PATH} />;
  }

  return (
    <InstanceStatusContext value={status}>{children}</InstanceStatusContext>
  );
};
