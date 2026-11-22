import { Banner, Button } from "@cloudflare/kumo";
import { OrganizationName } from "@repo/domain";
import type { Organization } from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import type { useCreateOrganization } from "./organizations.tsx";

const NewOrganization = Schema.Struct({ name: OrganizationName });

const NAME_HINT = "Usually the brand or newsletter’s name.";

/**
 * Names a new Organization. The person becomes its owner, and this tab
 * switches to it. On the home page the button sits beside the field. In a
 * dialog the form is only its field, and the dialog's own action submits it
 * through the form's `id`, so whoever renders it owns `create`.
 */
export const CreateOrganizationForm = ({
  create,
  fieldRef,
  id,
  layout,
  onCreated,
}: {
  create: ReturnType<typeof useCreateOrganization>;
  fieldRef?: React.Ref<HTMLInputElement>;
  id?: string;
  layout: "step" | "dialog";
  onCreated?: (created: Organization) => void;
}) => {
  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: ({ value }) => {
      const { name } = Schema.decodeSync(NewOrganization)(value);

      create.mutate(name, { onSuccess: (created) => onCreated?.(created) });
    },
    validators: { onSubmit: Schema.toStandardSchemaV1(NewOrganization) },
  });

  return (
    <form
      className="flex flex-col gap-4"
      id={id}
      noValidate
      onSubmit={(event) => submitForm(event, form)}
    >
      {create.isError ? (
        <Banner
          role="alert"
          title="Mailquilt couldn’t create the organization. Check your connection, then try again."
          variant="error"
        />
      ) : null}
      <div
        className={`grid gap-x-2 gap-y-1.5 ${layout === "step" ? "sm:grid-cols-[minmax(0,1fr)_auto]" : ""}`}
      >
        <form.Field name="name">
          {(field) => (
            <FormField
              autoComplete="organization"
              className="w-full max-sm:h-11 pointer-coarse:h-11"
              description={layout === "step" ? NAME_HINT : undefined}
              field={field}
              label="Organization name"
              placeholder="Acme Weekly"
              ref={fieldRef}
              size={layout === "step" ? "lg" : "base"}
            />
          )}
        </form.Field>
        {layout === "step" ? (
          <div className="mt-2 text-base sm:mt-[calc(1lh+var(--spacing)*2)] sm:self-start">
            <Button
              className="w-full justify-center sm:w-auto"
              loading={create.isPending}
              size="lg"
              type="submit"
              variant="primary"
            >
              Create organization
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
};
