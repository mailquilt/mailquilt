import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "../layout/app-shell.tsx";
import { SignedInOnly } from "../layout/session-gates.tsx";
import { OrganizationsProvider } from "../organizations/organizations.tsx";

const SignedInPages = () => (
  <SignedInOnly>
    <OrganizationsProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </OrganizationsProvider>
  </SignedInOnly>
);

export const Route = createFileRoute("/_app")({ component: SignedInPages });
