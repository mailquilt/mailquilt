import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AuthLayout } from "../layout/auth-layout.tsx";

const AuthPages = () => (
  <AuthLayout>
    <Outlet />
  </AuthLayout>
);

export const Route = createFileRoute("/_auth")({ component: AuthPages });
