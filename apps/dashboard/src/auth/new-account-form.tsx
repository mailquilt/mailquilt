import { Banner, Button } from "@cloudflare/kumo";
import {
  EmailAddress,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  NewPassword,
  PersonName,
} from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { WarningCircleIcon } from "../icons/icons.tsx";
import { PasswordField } from "./password-field.tsx";

export const NewAccount = Schema.Struct({
  email: EmailAddress,
  name: PersonName,
  password: NewPassword,
});

/**
 * Name, email and a new password, checked with the API's own rules: the
 * form behind sign-up and first-run setup. `problem` is shown above the
 * fields when the last try failed.
 */
export const NewAccountForm = ({
  busy,
  busyLabel,
  onSubmit,
  problem,
  submitLabel,
}: {
  busy: boolean;
  /** The submit button's label while waiting, such as "Creating account…". */
  busyLabel: string;
  onSubmit: (account: typeof NewAccount.Type) => void;
  problem: string | null;
  submitLabel: string;
}) => {
  const form = useForm({
    defaultValues: { email: "", name: "", password: "" },
    onSubmit: ({ value }) => {
      if (!busy) {
        onSubmit(value);
      }
    },
    validators: { onSubmit: Schema.toStandardSchemaV1(NewAccount) },
  });

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => submitForm(event, form)}
    >
      {problem ? (
        <Banner
          icon={<WarningCircleIcon />}
          role="alert"
          title={problem}
          variant="error"
        />
      ) : null}
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
            description={`${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`}
            field={field}
          />
        )}
      </form.Field>
      <Button
        aria-busy={busy}
        className="mt-1 w-full justify-center"
        type="submit"
        variant="primary"
      >
        {busy ? busyLabel : submitLabel}
      </Button>
    </form>
  );
};
