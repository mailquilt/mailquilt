import { Link } from "@cloudflare/kumo";
import { useLocation } from "@tanstack/react-router";

import { useInstanceStatusOfGate } from "../instance/setup-gate.tsx";
import { AuthHeading } from "../layout/auth-layout.tsx";
import { SignedOutOnly } from "../layout/session-gates.tsx";
import { SignInForm } from "./sign-in-form.tsx";

/**
 * Sign-in. It offers to make an account only while the install lets anyone
 * sign up. Arriving from first-run setup, whose own sign-in didn't work, it
 * says the admin account is ready.
 */
export const SignInPage = () => {
  const { signUp } = useInstanceStatusOfGate();
  const { state } = useLocation();

  return (
    <SignedOutOnly>
      <AuthHeading
        description={
          state.justSetUp
            ? "Your admin account is ready. Sign in with it to continue."
            : "Pick up your campaigns where you left them."
        }
      >
        Sign in
      </AuthHeading>
      <SignInForm />
      {signUp === "open" ? (
        <p className="mt-7 text-base text-kumo-subtle">
          New to Mailquilt?{" "}
          <Link className="font-medium" href="/sign-up">
            Create an account
          </Link>
        </p>
      ) : null}
    </SignedOutOnly>
  );
};
