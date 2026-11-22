import { useMutation } from "@tanstack/react-query";

import {
  authClient,
  authErrorMessage,
  EMAIL_VERIFIED_PATH,
  UNREACHABLE_MESSAGE,
} from "./auth-client.ts";
import { NewAccountForm } from "./new-account-form.tsx";
import type { NewAccount } from "./new-account-form.tsx";

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
    mutationFn: (account: typeof NewAccount.Type) =>
      authClient.signUp.email({ ...account, callbackURL: EMAIL_VERIFIED_PATH }),
    onSuccess: (result, account) => {
      if (!result.error) {
        onSignedUp(account.email);
      }
    },
  });

  const error = signUp.data?.error;
  let problem: string | null = null;

  if (error) {
    problem = authErrorMessage(error);
  } else if (signUp.isError) {
    problem = UNREACHABLE_MESSAGE;
  }

  return (
    <NewAccountForm
      busy={signUp.isPending}
      busyLabel="Creating account…"
      onSubmit={(account) => signUp.mutate(account)}
      problem={problem}
      submitLabel="Create account"
    />
  );
};
