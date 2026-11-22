import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SetupGate } from "../instance/setup-gate.tsx";
import { AuthLayout } from "../layout/auth-layout.tsx";

const AuthPages = () => (
  <AuthLayout>
    <SetupGate>
      <Outlet />
    </SetupGate>
  </AuthLayout>
);

export const Route = createFileRoute("/_auth")({ component: AuthPages });
