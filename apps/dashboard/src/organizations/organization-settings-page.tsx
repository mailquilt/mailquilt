import { Banner, Button } from "@cloudflare/kumo";
import { PostalAddress, postalAddressLine } from "@repo/domain";
import type { Organization } from "@repo/domain";
import { useForm, useStore } from "@tanstack/react-form";
import { Schema } from "effect";
import { useId } from "react";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageHeader } from "../layout/page-header.tsx";
import { SettingsSection } from "../layout/settings-section.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useUpdatePostalAddress } from "./organizations.tsx";

const AddressForm = Schema.Struct({ postalAddress: PostalAddress });

const FooterAsTyped = ({
  name,
  postalAddress,
}: {
  name: string;
  postalAddress: string;
}) => (
  <figure className="m-0 flex flex-col gap-2">
    <figcaption className="text-sm font-medium text-kumo-subtle">
      How it ends every campaign
    </figcaption>
    <div className="flex flex-col items-center gap-1.5 rounded-xl bg-kumo-recessed px-4 py-5 text-center text-sm text-pretty break-words text-kumo-subtle">
      <p>
        Don’t want these emails? <span className="underline">Unsubscribe</span>{" "}
        or <span className="underline">manage your preferences</span>
      </p>
      {postalAddress.trim() === "" ? (
        <p className="rounded-md border border-dashed border-(--mq-logo-slot) px-2.5 py-0.5">
          Your postal address goes here
        </p>
      ) : (
        <p className="max-w-full">{postalAddressLine(name, postalAddress)}</p>
      )}
    </div>
  </figure>
);

const PostalAddressSection = ({
  organization,
}: {
  organization: Organization;
}) => {
  const update = useUpdatePostalAddress(organization.id);
  const toasts = useConfirmationToast();
  const formId = useId();

  const form = useForm({
    defaultValues: { postalAddress: organization.postalAddress ?? "" },
    onSubmit: ({ value }) => {
      if (update.isPending) {
        return;
      }

      const { postalAddress } = Schema.decodeSync(AddressForm)(value);

      update.mutate(postalAddress, {
        onSuccess: () => toasts.add({ title: "Saved the postal address" }),
      });
    },
    validators: { onSubmit: Schema.toStandardSchemaV1(AddressForm) },
  });

  const typed = useStore(form.store, (state) => state.values.postalAddress);

  return (
    <SettingsSection
      about="Anti-spam laws ask every marketing email to say where you can be reached by post, so each campaign ends with it."
      footer={
        <Button
          aria-busy={update.isPending}
          form={formId}
          type="submit"
          variant="primary"
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      }
      title="Postal address"
    >
      <form
        className="flex flex-col gap-5"
        id={formId}
        noValidate
        onSubmit={(event) => submitForm(event, form)}
      >
        <form.Field
          listeners={{
            onChange: () => {
              if (update.isError) {
                update.reset();
              }
            },
          }}
          name="postalAddress"
        >
          {(field) => (
            <FormField
              description="A street address, PO box or registered mailbox. Line breaks become commas in the email."
              field={field}
              label="Postal address"
              rows={4}
            />
          )}
        </form.Field>
        <FooterAsTyped name={organization.name} postalAddress={typed} />
        {update.isError ? (
          <Banner
            role="alert"
            title="Mailquilt couldn’t save the postal address. Check your connection, then try again."
            variant="error"
          />
        ) : null}
      </form>
    </SettingsSection>
  );
};

/**
 * The settings of the Organization this tab works in, for its members.
 * For now, the postal address every Campaign ends with, which a Campaign
 * can't be sent without.
 */
export const OrganizationSettingsPage = ({
  organization,
}: {
  organization: Organization;
}) => (
  <PageFrame>
    <div className="mq-capped">
      <PageHeader
        description={`These apply to everyone in ${organization.name}.`}
        title="Settings"
        titleDetail={organization.name}
      />
      <div>
        <PostalAddressSection organization={organization} />
      </div>
    </div>
  </PageFrame>
);
