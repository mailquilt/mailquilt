import { Banner, Button } from "@cloudflare/kumo";
import { EmailAddress, Password } from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Schema } from "effect";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { WarningCircleIcon, WarningIcon } from "../icons/icons.tsx";
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

const Credentials = Schema.Struct({ email: EmailAddress, password: Password });

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
          variant="secondary"
        >
          {SEND_LINK_LABEL}
        </Banner.Action>
      }
      description={
        send.isError
          ? LINK_NOT_SENT_MESSAGE
          : "Open the link we emailed you to finish signing up."
      }
      icon={<WarningIcon />}
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
    mutationFn: (credentials: typeof Credentials.Type) =>
      authClient.signIn.email(credentials),
  });

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: ({ value }) => signIn.mutate(value),
    validators: { onSubmit: Schema.toStandardSchemaV1(Credentials) },
  });

  const error = signIn.data?.error;
  let problem: React.ReactNode = null;

  if (error?.code === "EMAIL_NOT_VERIFIED" && signIn.variables) {
    problem = <VerifyFirst email={signIn.variables.email} />;
  } else if (error) {
    problem = (
      <Banner
        icon={<WarningCircleIcon />}
        role="alert"
        title={authErrorMessage(error)}
        variant="error"
      />
    );
  } else if (signIn.isError) {
    problem = (
      <Banner
        icon={<WarningCircleIcon />}
        role="alert"
        title={UNREACHABLE_MESSAGE}
        variant="error"
      />
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => submitForm(event, form)}
    >
      {problem}
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
          <PasswordField autoComplete="current-password" field={field} />
        )}
      </form.Field>
      <Button
        className="mt-1 w-full justify-center"
        loading={signIn.isPending}
        type="submit"
        variant="primary"
      >
        Sign in
      </Button>
    </form>
  );
};
