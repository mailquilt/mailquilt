import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "../layout/app-shell.tsx";
import { SignedInOnly } from "../layout/session-gates.tsx";

const SignedInPages = () => (
  <SignedInOnly>
    <AppShell>
      <Outlet />
    </AppShell>
  </SignedInOnly>
);

export const Route = createFileRoute("/_app")({ component: SignedInPages });
