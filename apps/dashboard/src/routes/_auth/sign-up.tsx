import { Link } from "@cloudflare/kumo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SignUpForm } from "../../auth/sign-up-form.tsx";
import { AuthHeading } from "../../layout/auth-layout.tsx";
import { SignedOutOnly } from "../../layout/session-gates.tsx";

const SignUp = () => {
  const navigate = useNavigate();

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

export const Route = createFileRoute("/_auth/sign-up")({
  component: SignUp,
  head: () => ({ meta: [{ title: "Create your account – Mailquilt" }] }),
});
