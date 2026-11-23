import { Banner } from "@cloudflare/kumo";
import { ListName } from "@repo/domain";
import type { Organization } from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { useId, useRef } from "react";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useCreateList } from "./audience-api.ts";

const NewList = Schema.Struct({ name: ListName });

/**
 * Names a new List. It starts empty; Contacts are added from Contacts. Give
 * it `useDialog`'s `key` and `handleExited`, so each opening starts blank.
 */
export const NewListDialog = ({
  finalFocus,
  onExited,
  onOpenChange,
  open,
  organization,
}: {
  finalFocus?: React.RefObject<HTMLElement | null>;
  /** `useDialog`'s `handleExited`, so it starts fresh after each close. */
  onExited?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organization: Organization;
}) => {
  const create = useCreateList(organization.id);
  const toasts = useConfirmationToast();
  const formId = useId();
  const nameField = useRef<HTMLInputElement>(null);

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: ({ value }) => {
      const { name } = Schema.decodeSync(NewList)(value);

      create.mutate(name, {
        onSuccess: (list) => {
          onOpenChange(false);
          toasts.add({ title: `Created ${list.name}` });
        },
      });
    },
    validators: { onSubmit: Schema.toStandardSchemaV1(NewList) },
  });

  return (
    <ActionDialog
      actionLabel="Create list"
      busy={create.isPending}
      description="Make one for each thing people can sign up for, such as a weekly newsletter or product updates."
      finalFocus={finalFocus}
      formId={formId}
      initialFocus={nameField}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title="New list"
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        noValidate
        onSubmit={(event) => submitForm(event, form)}
      >
        {create.isError ? (
          <Banner
            role="alert"
            title="Mailquilt couldn’t create the list. Check your connection, then try again."
            variant="error"
          />
        ) : null}
        <form.Field name="name">
          {(field) => (
            <FormField
              autoComplete="off"
              className="w-full max-sm:h-11 pointer-coarse:h-11"
              field={field}
              label="List name"
              placeholder="Weekly news"
              ref={nameField}
              size="base"
            />
          )}
        </form.Field>
      </form>
    </ActionDialog>
  );
};
