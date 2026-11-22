import { Button } from "@cloudflare/kumo";
import { EmailAddress } from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import {
  LINK_NOT_SENT_MESSAGE,
  SEND_LINK_LABEL,
  useSendVerificationLink,
} from "./send-verification-link.ts";

const LinkRequest = Schema.Struct({ email: EmailAddress });

/** Asks for the address and sends a fresh verification link to it. */
export const SendLinkForm = ({
  onSent,
}: {
  onSent: (email: string) => void;
}) => {
  const send = useSendVerificationLink({ onSent });

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: ({ value }) => send.mutate(value.email),
    validators: { onSubmit: Schema.toStandardSchemaV1(LinkRequest) },
  });

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => submitForm(event, form)}
    >
      <form.Field
        listeners={{
          onChange: () => {
            if (send.isError) {
              send.reset();
            }
          },
        }}
        name="email"
      >
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
      {send.isError ? (
        <p className="text-base text-kumo-danger" role="alert">
          {LINK_NOT_SENT_MESSAGE}
        </p>
      ) : null}
      <Button
        className="w-full justify-center"
        loading={send.isPending}
        size="lg"
        type="submit"
        variant="primary"
      >
        {SEND_LINK_LABEL}
      </Button>
    </form>
  );
};
