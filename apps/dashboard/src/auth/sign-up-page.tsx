import { Link } from "@cloudflare/kumo";
import { useNavigate } from "@tanstack/react-router";

import { useInstanceStatusOfGate } from "../instance/setup-gate.tsx";
import { AuthHeading } from "../layout/auth-layout.tsx";
import { SignedOutOnly } from "../layout/session-gates.tsx";
import { SignUpForm } from "./sign-up-form.tsx";

const SignUpClosed = () => (
  <SignedOutOnly>
    <AuthHeading description="This Mailquilt is invite-only. Ask the person who runs it to give you access.">
      Sign-up is closed
    </AuthHeading>
    <p className="text-base text-kumo-subtle">
      Already have an account?{" "}
      <Link className="font-medium" href="/sign-in">
        Sign in
      </Link>
    </p>
  </SignedOutOnly>
);

/**
 * Sign-up while the install lets anyone make an account; while it is
 * invite-only, a page that says so and points to sign-in instead.
 */
export const SignUpPage = () => {
  const navigate = useNavigate();
  const { signUp } = useInstanceStatusOfGate();

  if (signUp !== "open") {
    return <SignUpClosed />;
  }

  return (
    <SignedOutOnly>
      <AuthHeading description="It takes a minute. You’ll confirm your email address to finish.">
        Create your account
      </AuthHeading>
      <SignUpForm
        onSignedUp={(email) =>
          navigate({
            state: { verificationEmail: email },
            to: "/check-your-inbox",
          })
        }
      />
      <p className="mt-7 text-base text-kumo-subtle">
        Already have an account?{" "}
        <Link className="font-medium" href="/sign-in">
          Sign in
        </Link>
      </p>
    </SignedOutOnly>
  );
};
