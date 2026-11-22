import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SignedOutPages } from "../layout/signed-out-pages.tsx";

const AuthPages = () => (
  <SignedOutPages>
    <Outlet />
  </SignedOutPages>
);

export const Route = createFileRoute("/_auth")({ component: AuthPages });
