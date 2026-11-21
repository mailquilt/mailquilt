import { Banner, Button, Input } from "@cloudflare/kumo";
import { useMutation } from "@tanstack/react-query";

import {
  authClient,
  authErrorMessage,
  EMAIL_VERIFIED_PATH,
} from "./auth-client.ts";

interface NewAccount {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

const readNewAccount = (form: HTMLFormElement) => {
  const data = new FormData(form);

  return {
    email: String(data.get("email") ?? ""),
    name: String(data.get("name") ?? ""),
    password: String(data.get("password") ?? ""),
  } satisfies NewAccount;
};

/**
 * Email and password sign-up. The account can't sign in until the person
 * opens the verification link, so success asks them to check their email.
 */
export const SignUpForm = () => {
  const signUp = useMutation({
    mutationFn: (account: NewAccount) =>
      authClient.signUp.email({ ...account, callbackURL: EMAIL_VERIFIED_PATH }),
  });

  if (signUp.data && !signUp.data.error) {
    return (
      <output>
        <Banner
          description={`We sent a link to ${signUp.variables.email}. Open it to verify your email address, then sign in.`}
          title="Check your email"
        />
      </output>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        signUp.mutate(readNewAccount(event.currentTarget));
      }}
    >
      {signUp.data?.error ? (
        <Banner
          role="alert"
          title={authErrorMessage(signUp.data.error)}
          variant="error"
        />
      ) : null}
      <Input autoComplete="name" label="Name" name="name" required />
      <Input
        autoComplete="email"
        label="Email"
        name="email"
        required
        type="email"
      />
      <Input
        autoComplete="new-password"
        description="At least 8 characters."
        label="Password"
        minLength={8}
        name="password"
        required
        type="password"
      />
      <Button loading={signUp.isPending} type="submit" variant="primary">
        Create account
      </Button>
    </form>
  );
};
