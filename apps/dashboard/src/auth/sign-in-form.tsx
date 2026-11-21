import { Banner, Button, Input } from "@cloudflare/kumo";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import {
  authClient,
  authErrorMessage,
  EMAIL_VERIFIED_PATH,
} from "./auth-client.ts";

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

const ResendVerification = ({ email }: { email: string }) => {
  const resend = useMutation({
    mutationFn: () =>
      authClient.sendVerificationEmail({
        callbackURL: EMAIL_VERIFIED_PATH,
        email,
      }),
  });

  if (resend.data && !resend.data.error) {
    return (
      <output>
        <Banner title={`We sent a new link to ${email}.`} />
      </output>
    );
  }

  return (
    <Banner
      action={
        <Banner.Action
          loading={resend.isPending}
          onClick={() => resend.mutate()}
        >
          Send the link again
        </Banner.Action>
      }
      description={
        resend.data?.error
          ? authErrorMessage(resend.data.error)
          : "Open the link we emailed you to finish signing up."
      }
      role="alert"
      title="Verify your email address first"
      variant="alert"
    />
  );
};

/** Email and password sign-in. Calls `onSignedIn` once a session exists. */
export const SignInForm = ({ onSignedIn }: { onSignedIn: () => void }) => {
  const [email, setEmail] = useState("");

  const signIn = useMutation({
    mutationFn: (credentials: Credentials) =>
      authClient.signIn.email(credentials),
    onSuccess: (result) => {
      if (!result.error) {
        onSignedIn();
      }
    },
  });

  const error = signIn.data?.error;
  let problem: React.ReactNode = null;

  if (error?.code === "EMAIL_NOT_VERIFIED") {
    problem = <ResendVerification email={email} />;
  } else if (error) {
    problem = (
      <Banner role="alert" title={authErrorMessage(error)} variant="error" />
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const credentials = readCredentials(event.currentTarget);
        setEmail(credentials.email);
        signIn.mutate(credentials);
      }}
    >
      {problem}
      <Input
        autoComplete="email"
        label="Email"
        name="email"
        required
        type="email"
      />
      <Input
        autoComplete="current-password"
        label="Password"
        name="password"
        required
        type="password"
      />
      <Button loading={signIn.isPending} type="submit" variant="primary">
        Sign in
      </Button>
    </form>
  );
};
