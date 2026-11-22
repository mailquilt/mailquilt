import { Banner, Button, Input } from "@cloudflare/kumo";
import { useState } from "react";

import { useCreateOrganization } from "./organizations.tsx";

const MAX_NAME_LENGTH = 100;

/**
 * Names a new Organization. The person becomes its owner, and this tab
 * switches to it.
 */
export const CreateOrganizationForm = ({
  onCreated,
}: {
  onCreated?: () => void;
}) => {
  const create = useCreateOrganization();
  const [nameError, setNameError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-5"
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
        create.mutate(name, { onSuccess: () => onCreated?.() });
      }}
    >
      {create.isError ? (
        <Banner
          role="alert"
          title="Mailquilt couldn’t create the organization. Check your connection, then try again."
          variant="error"
        />
      ) : null}
      <Input
        autoComplete="organization"
        description="Usually your brand or newsletter’s name."
        error={nameError ?? undefined}
        label="Organization name"
        maxLength={MAX_NAME_LENGTH}
        name="name"
        required
        size="lg"
      />
      <Button
        className="w-full justify-center sm:w-fit"
        loading={create.isPending}
        size="lg"
        type="submit"
        variant="primary"
      >
        Create organization
      </Button>
    </form>
  );
};
