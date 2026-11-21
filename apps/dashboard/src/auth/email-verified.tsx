import { LinkButton, Text } from "@cloudflare/kumo";

/**
 * Where the verification link lands. Better Auth has already checked the
 * link, and on success signed the person in; on failure it adds `error`.
 */
export const EmailVerified = ({ error }: { error?: string | undefined }) => {
  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Text as="h1" size="lg" variant="heading">
          This link no longer works
        </Text>
        <Text variant="secondary">
          Verification links expire after an hour. Sign in to get a new one.
        </Text>
        <LinkButton href="/sign-in" variant="primary">
          Sign in
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <Text as="h1" size="lg" variant="heading">
        Your email address is verified
      </Text>
      <LinkButton href="/" variant="primary">
        Go to the dashboard
      </LinkButton>
    </div>
  );
};
