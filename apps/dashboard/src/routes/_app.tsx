import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "../layout/app-shell.tsx";
import { SignedInOnly } from "../layout/session-gates.tsx";
import {
  OrganizationsProvider,
  useOrganizationsAlongsideSession,
} from "../organizations/organizations.tsx";

const SignedInPages = () => {
  const firstList = useOrganizationsAlongsideSession();

  return (
    <SignedInOnly loading={firstList.isPending}>
      <OrganizationsProvider firstList={firstList.data}>
        <AppShell>
          <Outlet />
        </AppShell>
      </OrganizationsProvider>
    </SignedInOnly>
  );
};

export const Route = createFileRoute("/_app")({ component: SignedInPages });
