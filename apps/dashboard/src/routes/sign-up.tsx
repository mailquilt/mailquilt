import { Surface, Text } from "@cloudflare/kumo";
import { createFileRoute, Link } from "@tanstack/react-router";

import { SignUpForm } from "../auth/sign-up-form.tsx";

const SignUp = () => (
  <Surface className="mx-auto flex max-w-sm flex-col gap-4 rounded-lg p-6">
    <Text as="h1" size="lg" variant="heading">
      Create your account
    </Text>
    <SignUpForm />
    <Text variant="secondary">
      Already have an account? <Link to="/sign-in">Sign in</Link>
    </Text>
  </Surface>
);

export const Route = createFileRoute("/sign-up")({ component: SignUp });
