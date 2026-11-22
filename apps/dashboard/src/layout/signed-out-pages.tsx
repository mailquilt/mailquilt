import { SetupGate } from "../instance/setup-gate.tsx";
import { AuthLayout } from "./auth-layout.tsx";

/**
 * Every signed-out page, behind the install's setup status: the whole page
 * waits for it, then draws its layout and content at once.
 */
export const SignedOutPages = ({ children }: { children: React.ReactNode }) => (
  <SetupGate>
    <AuthLayout>{children}</AuthLayout>
  </SetupGate>
);
