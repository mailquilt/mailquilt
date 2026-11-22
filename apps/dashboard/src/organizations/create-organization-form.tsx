import { Banner, Button, Input } from "@cloudflare/kumo";
import type { Organization } from "@repo/domain";
import { useId, useState } from "react";

import type { useCreateOrganization } from "./organizations.tsx";

const MAX_NAME_LENGTH = 100;

const NAME_HINT = "Usually the brand or newsletter’s name.";

/**
 * Names a new Organization. The person becomes its owner, and this tab
 * switches to it. On the home page the button sits beside the field. In a
 * dialog the form is only its field, and the dialog's own action submits it
 * through the form's `id`, so whoever renders it owns `create`.
 */
export const CreateOrganizationForm = ({
  create,
  id,
  layout,
  onCreated,
}: {
  create: ReturnType<typeof useCreateOrganization>;
  id?: string;
  layout: "step" | "dialog";
  onCreated?: (created: Organization) => void;
}) => {
  const [nameError, setNameError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const hint = nameError ?? (layout === "step" ? NAME_HINT : null);

  return (
    <form
      className="flex flex-col gap-4"
      id={id}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();

        const name = String(
          new FormData(event.currentTarget).get("name") ?? ""
        ).trim();

        if (name === "") {
          setNameError("Enter a name for your organization.");

          return;
        }

        setNameError(null);
        create.mutate(name, { onSuccess: (created) => onCreated?.(created) });
      }}
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
        <label
          className="text-base font-medium text-kumo-strong sm:col-span-full"
          htmlFor={inputId}
        >
          Organization name
        </label>
        <Input
          aria-describedby={hint === null ? undefined : hintId}
          aria-invalid={nameError !== null}
          autoComplete="organization"
          className="w-full max-sm:h-11 max-sm:text-lg"
          id={inputId}
          maxLength={MAX_NAME_LENGTH}
          name="name"
          placeholder="Acme Weekly"
          size={layout === "step" ? "lg" : "base"}
          variant={nameError === null ? "default" : "error"}
        />
        {hint === null ? null : (
          <p
            className={`text-sm sm:row-start-3 ${nameError === null ? "text-kumo-subtle" : "text-kumo-danger"}`}
            id={hintId}
            role={nameError === null ? undefined : "alert"}
          >
            {hint}
          </p>
        )}
        {layout === "step" ? (
          <div className="mt-2 sm:col-start-2 sm:row-start-2 sm:mt-0">
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
