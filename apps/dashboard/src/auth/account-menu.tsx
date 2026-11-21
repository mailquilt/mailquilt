import { Button, LinkButton, Text } from "@cloudflare/kumo";

import { authClient } from "./auth-client.ts";

/** Who is signed in, with sign-out; or links to sign in and sign up. */
export const AccountMenu = () => {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return null;
  }

  if (!session) {
    return (
      <nav aria-label="Account" className="flex items-center gap-2">
        <LinkButton href="/sign-in" variant="ghost">
          Sign in
        </LinkButton>
        <LinkButton href="/sign-up" variant="secondary">
          Sign up
        </LinkButton>
      </nav>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Text variant="secondary">{session.user.email}</Text>
      <Button onClick={() => authClient.signOut()} variant="secondary">
        Sign out
      </Button>
    </div>
  );
};
