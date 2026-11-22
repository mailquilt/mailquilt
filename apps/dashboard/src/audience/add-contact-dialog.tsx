import { Banner, Checkbox, useKumoToastManager } from "@cloudflare/kumo";
import { ContactEmail, ListIdSchema } from "@repo/domain";
import type { List, ListId, Organization } from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import { Predicate, Schema } from "effect";
import { useId, useRef } from "react";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { useCreateContact } from "./audience-api.ts";
import { formatCount } from "./format.ts";

const NewContact = Schema.Struct({
  email: ContactEmail,
  listIds: Schema.Array(ListIdSchema),
});

const listNames = (lists: readonly List[], ids: readonly ListId[]) =>
  lists.flatMap((list) => (ids.includes(list.id) ? [list.name] : []));

/**
 * Adds one Contact, optionally subscribed to Lists, which start as
 * `preselected` (the List the table is filtered by). An address the
 * Organization already has is reported on the field, whatever its case.
 * Mount it afresh for each opening (a new `key`), so it starts empty.
 */
export const AddContactDialog = ({
  finalFocus,
  lists,
  onOpenChange,
  open,
  organization,
  preselected,
}: {
  finalFocus?: React.RefObject<HTMLElement | null>;
  lists: readonly List[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organization: Organization;
  preselected: readonly ListId[];
}) => {
  const create = useCreateContact(organization.id);
  const toasts = useKumoToastManager();
  const formId = useId();
  const emailField = useRef<HTMLInputElement>(null);

  const blank: typeof NewContact.Encoded = { email: "", listIds: preselected };

  const form = useForm({
    defaultValues: blank,
    onSubmit: ({ value }) => {
      const { email, listIds } = Schema.decodeSync(NewContact)(value);

      create.mutate(
        { email, listIds },
        {
          onError: (error) => {
            const stillTheSameAddress =
              form.getFieldValue("email") === value.email;

            if (
              Predicate.isTagged(error, "ContactAlreadyExists") &&
              stillTheSameAddress
            ) {
              form.setFieldMeta("email", (meta) => ({
                ...meta,
                errorMap: {
                  ...meta.errorMap,
                  onSubmit: {
                    message: `${organization.name} already has a contact with this address.`,
                  },
                },
              }));
            }
          },
          onSuccess: (contact) => {
            const names = listNames(lists, listIds);
            onOpenChange(false);
            toasts.add({
              description:
                names.length === 0
                  ? undefined
                  : `Subscribed to ${new Intl.ListFormat("en").format(names)}.`,
              title: `Added ${contact.email}`,
            });
          },
        }
      );
    },
    validators: { onSubmit: Schema.toStandardSchemaV1(NewContact) },
  });

  const failedOtherwise =
    create.isError && !Predicate.isTagged(create.error, "ContactAlreadyExists");

  return (
    <ActionDialog
      actionLabel="Add contact"
      busy={create.isPending}
      description={`Only add people who agreed to get email from ${organization.name}.`}
      finalFocus={finalFocus}
      formId={formId}
      initialFocus={emailField}
      onOpenChange={onOpenChange}
      open={open}
      title="Add a contact"
    >
      <form
        className="flex flex-col gap-5"
        id={formId}
        noValidate
        onSubmit={(event) => submitForm(event, form)}
      >
        {failedOtherwise ? (
          <Banner
            role="alert"
            title="Mailquilt couldn’t add the contact. Check your connection, then try again."
            variant="error"
          />
        ) : null}
        <form.Field name="email">
          {(field) => (
            <FormField
              autoComplete="off"
              className="w-full max-sm:h-11 pointer-coarse:h-11"
              field={field}
              inputMode="email"
              label="Email address"
              placeholder="name@example.com"
              ref={emailField}
              size="base"
              type="email"
            />
          )}
        </form.Field>
        {lists.length === 0 ? null : (
          <form.Field name="listIds">
            {(field) => (
              <fieldset className="flex flex-col">
                <legend className="text-base font-medium text-kumo-strong">
                  Subscribe to
                </legend>
                <p className="mt-0.5 mb-2 text-sm text-kumo-subtle">
                  Optional. They’ll get the campaigns sent to these lists.
                </p>
                <ul className="-mx-1 flex max-h-56 flex-col overflow-y-auto px-1">
                  {lists.map((list) => (
                    <li
                      className="flex min-h-11 items-center gap-3 border-b border-kumo-hairline first:border-t"
                      key={list.id}
                    >
                      <Checkbox
                        checked={field.state.value.includes(list.id)}
                        label={list.name}
                        onCheckedChange={(checked) =>
                          field.handleChange(
                            checked
                              ? [...field.state.value, list.id]
                              : field.state.value.filter((id) => id !== list.id)
                          )
                        }
                      />
                      <span className="ml-auto shrink-0 text-sm text-kumo-subtle tabular-nums">
                        {formatCount(list.subscriptions.subscribed)} subscribed
                      </span>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
          </form.Field>
        )}
      </form>
    </ActionDialog>
  );
};
