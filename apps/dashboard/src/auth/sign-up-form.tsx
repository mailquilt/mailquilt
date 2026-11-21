import { Banner, Button, Input } from "@cloudflare/kumo";
import { useMutation } from "@tanstack/react-query";

import {
  authClient,
  authErrorMessage,
  EMAIL_VERIFIED_PATH,
  MIN_PASSWORD_LENGTH,
} from "./auth-client.ts";
import { PasswordField } from "./password-field.tsx";

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
 * opens the verification link, so success hands over to "check your inbox".
 */
export const SignUpForm = ({
  onSignedUp,
}: {
  onSignedUp: (email: string) => void;
}) => {
  const signUp = useMutation({
    mutationFn: (account: NewAccount) =>
      authClient.signUp.email({ ...account, callbackURL: EMAIL_VERIFIED_PATH }),
    onSuccess: (result, account) => {
      if (!result.error) {
        onSignedUp(account.email);
      }
    },
  });

  return (
    <form
      className="flex flex-col gap-5"
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
      <Input
        autoComplete="name"
        label="Your name"
        name="name"
        required
        size="lg"
      />
      <Input
        autoComplete="email"
        label="Email"
        name="email"
        required
        size="lg"
        type="email"
      />
      <PasswordField
        autoComplete="new-password"
        description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        minLength={MIN_PASSWORD_LENGTH}
      />
      <Button
        className="mt-1 w-full justify-center"
        loading={signUp.isPending}
        size="lg"
        type="submit"
        variant="primary"
      >
        Create account
      </Button>
    </form>
  );
};
