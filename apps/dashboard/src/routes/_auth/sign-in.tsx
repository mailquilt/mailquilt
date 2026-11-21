import { Link } from "@cloudflare/kumo";
import { createFileRoute } from "@tanstack/react-router";

import { SignInForm } from "../../auth/sign-in-form.tsx";
import { AuthHeading } from "../../layout/auth-layout.tsx";
import { SignedOutOnly } from "../../layout/session-gates.tsx";

const SignIn = () => (
  <SignedOutOnly>
    <AuthHeading description="Pick up your campaigns where you left them.">
      Sign in
    </AuthHeading>
    <SignInForm />
    <p className="mt-7 text-base text-kumo-subtle">
      New to Mailquilt?{" "}
      <Link className="font-medium" href="/sign-up">
        Create an account
      </Link>
    </p>
  </SignedOutOnly>
);

export const Route = createFileRoute("/_auth/sign-in")({
  component: SignIn,
  head: () => ({ meta: [{ title: "Sign in – Mailquilt" }] }),
});
