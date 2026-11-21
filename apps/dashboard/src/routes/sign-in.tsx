import { Surface, Text } from "@cloudflare/kumo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { SignInForm } from "../auth/sign-in-form.tsx";

const SignIn = () => {
  const navigate = useNavigate();

  return (
    <Surface className="mx-auto flex max-w-sm flex-col gap-4 rounded-lg p-6">
      <Text as="h1" size="lg" variant="heading">
        Sign in
      </Text>
      <SignInForm onSignedIn={() => navigate({ to: "/" })} />
      <Text variant="secondary">
        New to Mailquilt? <Link to="/sign-up">Create an account</Link>
      </Text>
    </Surface>
  );
};

export const Route = createFileRoute("/sign-in")({ component: SignIn });
