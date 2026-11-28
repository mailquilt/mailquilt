import { Banner } from "@cloudflare/kumo";
import type { Organization, ProviderConnection } from "@repo/domain";
import { useId } from "react";

import { ActionDialog } from "../layout/action-dialog.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useDeleteConnection } from "./providers-api.ts";

const deletedDescription = (
  organization: string,
  connection: ProviderConnection
) => {
  if (connection.provider === "ses") {
    return `${organization} can’t send through it any more, and its saved access key is erased. This can’t be undone.`;
  }

  if (connection.provider === "cloudflare") {
    return `${organization} can’t send through it any more, and its saved API token is erased. This can’t be undone.`;
  }

  return connection.signsIn
    ? `${organization} can’t send through it any more, and its saved username and password are erased. This can’t be undone.`
    : `${organization} can’t send through it any more. This can’t be undone.`;
};

/**
 * Asks before deleting a connection, and deletes it. Its card disappears with
 * it, so the page takes focus through `onDeleted`.
 */
export const DeleteConnectionDialog = ({
  connection,
  finalFocus,
  onDeleted,
  onExited,
  onOpenChange,
  open,
  organization,
}: {
  connection: ProviderConnection;
  finalFocus?: React.RefObject<HTMLElement | null>;
  /** Called once the connection is gone, while its card and this dialog go with it. */
  onDeleted: (name: string) => void;
  /** `useDialog`'s `handleExited`, so it starts fresh after each close. */
  onExited?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organization: Organization;
}) => {
  const remove = useDeleteConnection(organization.id);
  const toasts = useConfirmationToast();
  const formId = useId();

  // WARNING: the deletion removes this card, and this dialog with it, before mutate's own callbacks would run; mutateAsync's promise still settles.
  const deleteConnection = async () => {
    const gone = await remove
      .mutateAsync(connection.id)
      .then(() => true)
      .catch(() => false);

    if (gone) {
      onOpenChange(false);
      onDeleted(connection.name);
      toasts.add({ title: `Deleted ${connection.name}` });
    }
  };

  return (
    <ActionDialog
      actionLabel="Delete connection"
      busy={remove.isPending}
      description={deletedDescription(organization.name, connection)}
      destructive
      finalFocus={finalFocus}
      formId={formId}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title={`Delete ${connection.name}?`}
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          deleteConnection();
        }}
      >
        {remove.isError ? (
          <Banner
            role="alert"
            title={`Mailquilt couldn’t confirm that ${connection.name} was deleted. Try again.`}
            variant="error"
          />
        ) : null}
      </form>
    </ActionDialog>
  );
};
