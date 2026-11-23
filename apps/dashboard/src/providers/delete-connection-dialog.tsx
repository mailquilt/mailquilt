import { Banner } from "@cloudflare/kumo";
import type { Organization, ProviderConnection } from "@repo/domain";
import { useId } from "react";

import { ActionDialog } from "../layout/action-dialog.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useDeleteConnection } from "./providers-api.ts";

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
      description={
        connection.signsIn
          ? `${organization.name} can’t send through it any more, and its saved username and password are erased. This can’t be undone.`
          : `${organization.name} can’t send through it any more. This can’t be undone.`
      }
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
            title={`Mailquilt couldn’t reach its server, so ${connection.name} wasn’t deleted. Try again.`}
            variant="error"
          />
        ) : null}
      </form>
    </ActionDialog>
  );
};
