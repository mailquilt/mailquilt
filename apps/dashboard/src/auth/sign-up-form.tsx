import { Banner, Button } from "@cloudflare/kumo";
import {
  EmailAddress,
  MIN_PASSWORD_LENGTH,
  NewPassword,
  PersonName,
} from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Schema } from "effect";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import {
  authClient,
  authErrorMessage,
  EMAIL_VERIFIED_PATH,
  UNREACHABLE_MESSAGE,
} from "./auth-client.ts";
import { PasswordField } from "./password-field.tsx";

const NewAccount = Schema.Struct({
  email: EmailAddress,
  name: PersonName,
  password: NewPassword,
});

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

  const form = useForm({
    defaultValues: { email: "", name: "", password: "" },
    onSubmit: ({ value }) => signUp.mutate(value),
    validators: { onSubmit: Schema.toStandardSchemaV1(NewAccount) },
  });

  const error = signUp.data?.error;
  let problem: string | null = null;

  if (error) {
    problem = authErrorMessage(error);
  } else if (signUp.isError) {
    problem = UNREACHABLE_MESSAGE;
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => submitForm(event, form)}
    >
      {problem ? <Banner role="alert" title={problem} variant="error" /> : null}
      <form.Field name="name">
        {(field) => (
          <FormField
            autoComplete="name"
            field={field}
            label="Your name"
            required
          />
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <FormField
            autoComplete="email"
            field={field}
            label="Email"
            required
            type="email"
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <PasswordField
            autoComplete="new-password"
            description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            field={field}
          />
        )}
      </form.Field>
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
