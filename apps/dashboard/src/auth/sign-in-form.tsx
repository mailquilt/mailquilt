import { Banner, Button, Input } from "@cloudflare/kumo";
import { useMutation } from "@tanstack/react-query";

import {
  authClient,
  authErrorMessage,
  UNREACHABLE_MESSAGE,
} from "./auth-client.ts";
import { PasswordField } from "./password-field.tsx";
import {
  LINK_NOT_SENT_MESSAGE,
  LINK_SENT_MESSAGE,
  SEND_LINK_LABEL,
  useSendVerificationLink,
} from "./send-verification-link.ts";

interface Credentials {
  readonly email: string;
  readonly password: string;
}

const readCredentials = (form: HTMLFormElement) => {
  const data = new FormData(form);

  return {
    email: String(data.get("email") ?? ""),
    password: String(data.get("password") ?? ""),
  } satisfies Credentials;
};

const VerifyFirst = ({ email }: { email: string }) => {
  const send = useSendVerificationLink();

  if (send.isSuccess) {
    return (
      <output>
        <Banner className="wrap-anywhere" title={LINK_SENT_MESSAGE(email)} />
      </output>
    );
  }

  return (
    <Banner
      action={
        <Banner.Action
          loading={send.isPending}
          onClick={() => send.mutate(email)}
        >
          {SEND_LINK_LABEL}
        </Banner.Action>
      }
      description={
        send.isError
          ? LINK_NOT_SENT_MESSAGE
          : "Open the link we emailed you to finish signing up."
      }
      role="alert"
      title="Verify your email address first"
      variant="alert"
    />
  );
};

/**
 * Email and password sign-in. On success the session changes, and the page's
 * `SignedOutOnly` gate takes the person into the app.
 */
export const SignInForm = () => {
  const signIn = useMutation({
    mutationFn: (credentials: Credentials) =>
      authClient.signIn.email(credentials),
  });

  const error = signIn.data?.error;
  let problem: React.ReactNode = null;

  if (error?.code === "EMAIL_NOT_VERIFIED" && signIn.variables) {
    problem = <VerifyFirst email={signIn.variables.email} />;
  } else if (error) {
    problem = (
      <Banner role="alert" title={authErrorMessage(error)} variant="error" />
    );
  } else if (signIn.isError) {
    problem = (
      <Banner role="alert" title={UNREACHABLE_MESSAGE} variant="error" />
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        signIn.mutate(readCredentials(event.currentTarget));
      }}
    >
      {problem}
      <Input
        autoComplete="email"
        label="Email"
        name="email"
        required
        size="lg"
        type="email"
      />
      <PasswordField autoComplete="current-password" />
      <Button
        className="mt-1 w-full justify-center"
        loading={signIn.isPending}
        size="lg"
        type="submit"
        variant="primary"
      >
        Sign in
      </Button>
    </form>
  );
};
