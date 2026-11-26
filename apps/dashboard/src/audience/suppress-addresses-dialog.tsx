import { Banner } from "@cloudflare/kumo";
import { MAX_SUPPRESSIONS_ADDED_AT_ONCE } from "@repo/domain";
import type { Organization } from "@repo/domain";
import { useForm, useStore } from "@tanstack/react-form";
import { Array as Arr } from "effect";
import { useId, useRef } from "react";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import {
  countOfAddresses,
  eachOnce,
  isAddress,
  suppressedMessage,
} from "./addresses.ts";
import { useSuppressAddresses } from "./audience-api.ts";
import { formatCount } from "./format.ts";

const BETWEEN_ADDRESSES = /[\s,;]+/u;

const typedIn = (text: string) =>
  eachOnce(text.split(BETWEEN_ADDRESSES).filter((part) => part !== ""));

const problemWith = (text: string) => {
  const typed = typedIn(text);
  const notAnAddress = typed.find((address) => !isAddress(address));

  if (typed.length === 0) {
    return "Enter an email address.";
  }

  if (notAnAddress !== undefined) {
    return `“${notAnAddress}” isn’t an email address.`;
  }

  if (typed.length > MAX_SUPPRESSIONS_ADDED_AT_ONCE) {
    return `That’s ${formatCount(typed.length)} addresses. Suppress up to ${MAX_SUPPRESSIONS_ADDED_AT_ONCE} at a time, or import them from a CSV.`;
  }
};

/**
 * Suppresses one address, or a pasted handful of up to 250, separated by
 * lines, commas or spaces, each counted once whatever its case. Give it
 * `useDialog`'s `key` and `handleExited`, so each opening starts empty.
 */
export const SuppressAddressesDialog = ({
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
  const suppress = useSuppressAddresses(organization.id);
  const toasts = useConfirmationToast();
  const formId = useId();
  const field = useRef<HTMLTextAreaElement>(null);

  const form = useForm({
    defaultValues: { addresses: "" },
    onSubmit: ({ value }) => {
      const typed = typedIn(value.addresses);

      if (!Arr.isReadonlyArrayNonEmpty(typed)) {
        return;
      }

      suppress.mutate(typed, {
        onSuccess: (result) => {
          onOpenChange(false);
          toasts.add(
            suppressedMessage(result, {
              only: typed.length === 1 ? typed[0] : undefined,
            })
          );
        },
      });
    },
  });

  const count = useStore(
    form.store,
    (state) => typedIn(state.values.addresses).filter(isAddress).length
  );

  return (
    <ActionDialog
      actionLabel={
        count === 0
          ? "Suppress addresses"
          : `Suppress ${countOfAddresses(count)}`
      }
      busy={suppress.isPending}
      description="No campaign will reach them from now on, even one that’s already sending."
      finalFocus={finalFocus}
      formId={formId}
      initialFocus={field}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title="Suppress addresses"
    >
      <form
        className="flex flex-col gap-5"
        id={formId}
        noValidate
        onSubmit={(event) => submitForm(event, form)}
      >
        {suppress.isError ? (
          <Banner
            role="alert"
            title="Mailquilt couldn’t suppress these addresses. Check your connection, then try again."
            variant="error"
          />
        ) : null}
        <form.Field
          name="addresses"
          validators={{
            onSubmit: ({ value }) => {
              const problem = problemWith(value);

              return problem === undefined ? undefined : { message: problem };
            },
          }}
        >
          {(addressField) => (
            <FormField
              areaRef={field}
              autoComplete="off"
              className="w-full"
              description={`One per line, or separated by commas. Up to ${MAX_SUPPRESSIONS_ADDED_AT_ONCE} at a time.`}
              field={addressField}
              label="Email addresses"
              placeholder={"name@example.com\nanother@example.com"}
              rows={5}
            />
          )}
        </form.Field>
      </form>
    </ActionDialog>
  );
};
