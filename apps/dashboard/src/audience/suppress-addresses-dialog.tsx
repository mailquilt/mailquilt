import { Banner } from "@cloudflare/kumo";
import { ContactEmail, MAX_SUPPRESSIONS_ADDED_AT_ONCE } from "@repo/domain";
import type { Organization, SuppressionsAdded } from "@repo/domain";
import { useForm, useStore } from "@tanstack/react-form";
import { Array as Arr, Schema } from "effect";
import { useId, useRef } from "react";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useSuppressAddresses } from "./audience-api.ts";
import { formatCount, wrappableAddress } from "./format.ts";

const isAddress = Schema.is(ContactEmail);

const BETWEEN_ADDRESSES = /[\s,;]+/u;

const typedIn = (text: string) => {
  const byLowerCase = new Map<string, string>();

  for (const part of text.split(BETWEEN_ADDRESSES)) {
    if (part !== "" && !byLowerCase.has(part.toLowerCase())) {
      byLowerCase.set(part.toLowerCase(), part);
    }
  }

  return [...byLowerCase.values()];
};

const problemWith = (text: string) => {
  const addresses = typedIn(text);
  const notAnAddress = addresses.find((address) => !isAddress(address));

  if (addresses.length === 0) {
    return "Enter an email address.";
  }

  if (notAnAddress !== undefined) {
    return `“${notAnAddress}” isn’t an email address.`;
  }

  if (addresses.length > MAX_SUPPRESSIONS_ADDED_AT_ONCE) {
    return `That’s ${formatCount(addresses.length)} addresses. Suppress up to ${MAX_SUPPRESSIONS_ADDED_AT_ONCE} at a time, or import them from a CSV.`;
  }
};

/** "1 address", "1,204 addresses". */
export const addresses = (count: number) =>
  `${formatCount(count)} ${count === 1 ? "address" : "addresses"}`;

/**
 * What a toast says once addresses were Suppressed: the one address by
 * name, or how many, with those that already were and `alsoSkipped`, such
 * as an import's rows that weren't addresses.
 */
export const suppressedMessage = (
  { added, alreadySuppressed }: SuppressionsAdded,
  { alsoSkipped, only }: { alsoSkipped?: string; only?: string } = {}
) => {
  const total = added + alreadySuppressed;

  if (added === 0) {
    return {
      description:
        alsoSkipped === undefined ? "Nothing changed." : `${alsoSkipped}.`,
      title:
        only === undefined
          ? `All ${formatCount(total)} were already suppressed`
          : `${wrappableAddress(only)} was already suppressed`,
    };
  }

  if (only !== undefined) {
    return { title: `Suppressed ${wrappableAddress(only)}` };
  }

  const already =
    alreadySuppressed === 0
      ? undefined
      : `${formatCount(alreadySuppressed)} ${alreadySuppressed === 1 ? "was" : "were"} already suppressed`;

  const notes = [already, alsoSkipped].filter((note) => note !== undefined);

  return {
    description:
      notes.length === 0
        ? undefined
        : `${new Intl.ListFormat("en").format(notes)}.`,
    title: `${addresses(added)} suppressed`,
  };
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
        count === 0 ? "Suppress addresses" : `Suppress ${addresses(count)}`
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
