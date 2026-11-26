import { Banner } from "@cloudflare/kumo";
import type { Organization, Suppression } from "@repo/domain";
import { useId } from "react";

import { ActionDialog } from "../layout/action-dialog.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useRemoveSuppression } from "./audience-api.ts";
import { wrappableAddress } from "./format.ts";

/**
 * Asks before removing a Suppression added by hand, and removes it. Its row
 * disappears with it, so the page takes focus through `onRemoved`. Not drawn
 * as destructive: the address can be Suppressed again at any time.
 */
export const RemoveSuppressionDialog = ({
  finalFocus,
  onExited,
  onOpenChange,
  onRemoved,
  open,
  organization,
  suppression,
}: {
  finalFocus?: React.RefObject<HTMLElement | null>;
  /** `useDialog`'s `handleExited`, so it starts fresh after each close. */
  onExited?: () => void;
  onOpenChange: (open: boolean) => void;
  /** Called once the Suppression is gone, while its row and this dialog go with it. */
  onRemoved: (email: string) => void;
  open: boolean;
  organization: Organization;
  suppression: Suppression;
}) => {
  const remove = useRemoveSuppression(organization.id);
  const toasts = useConfirmationToast();
  const formId = useId();

  // WARNING: the removal takes away this row, and this dialog with it, before mutate's own callbacks would run; mutateAsync's promise still settles.
  const removeSuppression = async () => {
    const gone = await remove
      .mutateAsync(suppression.id)
      .then(() => true)
      .catch(() => false);

    if (gone) {
      onOpenChange(false);
      onRemoved(suppression.email);
      toasts.add({
        description: `Campaigns no longer leave out ${wrappableAddress(suppression.email)}.`,
        title: "Suppression removed",
      });
    }
  };

  return (
    <ActionDialog
      actionLabel="Remove suppression"
      busy={remove.isPending}
      description={
        <>
          Campaigns will no longer leave out{" "}
          <span className="font-medium text-kumo-strong">
            {wrappableAddress(suppression.email)}
          </span>
          . You can suppress it again at any time.
        </>
      }
      finalFocus={finalFocus}
      formId={formId}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title="Remove this suppression?"
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          removeSuppression();
        }}
      >
        {remove.isError ? (
          <Banner
            role="alert"
            title="Mailquilt couldn’t remove the suppression. Check your connection, then try again."
            variant="error"
          />
        ) : null}
      </form>
    </ActionDialog>
  );
};
