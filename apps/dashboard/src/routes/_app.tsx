import { Toasty } from "@cloudflare/kumo";
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "../layout/app-shell.tsx";
import { SignedInOnly } from "../layout/session-gates.tsx";
import { OrganizationsProvider } from "../organizations/organizations.tsx";

const SignedInPages = () => (
  <SignedInOnly>
    <Toasty>
      <OrganizationsProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </OrganizationsProvider>
    </Toasty>
  </SignedInOnly>
);

export const Route = createFileRoute("/_app")({ component: SignedInPages });
