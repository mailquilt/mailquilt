import { Banner, DropdownMenu } from "@cloudflare/kumo";
import type { Organization, SendingDomain } from "@repo/domain";
import { useId } from "react";

import { DotsThreeIcon, TrashIcon } from "../icons/icons.tsx";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useRemoveSendingDomain } from "./domains-api.ts";

/**
 * Asks before removing a Sending Domain, and removes it. Its row, or its
 * page, goes with it, so `onRemoved` says where to go next.
 */
export const RemoveDomainDialog = ({
  domain,
  finalFocus,
  onExited,
  onOpenChange,
  onRemoved,
  open,
  organization,
}: {
  domain: SendingDomain;
  finalFocus?: React.RefObject<HTMLElement | null>;
  /** `useDialog`'s `handleExited`, so it starts fresh after each close. */
  onExited?: () => void;
  onOpenChange: (open: boolean) => void;
  /** Called once the domain is gone, while its row and this dialog go with it. */
  onRemoved: () => void;
  open: boolean;
  organization: Organization;
}) => {
  const remove = useRemoveSendingDomain(organization.id);
  const toasts = useConfirmationToast();
  const formId = useId();

  // WARNING: the removal takes this row, and this dialog with it, before mutate's own callbacks would run; mutateAsync's promise still settles.
  const removeDomain = async () => {
    const gone = await remove
      .mutateAsync(domain.id)
      .then(() => true)
      .catch(() => false);

    if (gone) {
      onOpenChange(false);
      onRemoved();
      toasts.add({ title: `Removed ${domain.domain}` });
    }
  };

  return (
    <ActionDialog
      actionLabel="Remove domain"
      busy={remove.isPending}
      description={`Campaigns from addresses at ${domain.domain} can’t be sent, or start on schedule, until it’s added again. Its DNS records stay as they are.`}
      destructive
      finalFocus={finalFocus}
      formId={formId}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title={`Remove ${domain.domain}?`}
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          removeDomain();
        }}
      >
        {remove.isError ? (
          <Banner
            role="alert"
            title={`Mailquilt couldn’t confirm that ${domain.domain} was removed. Try again.`}
            variant="error"
          />
        ) : null}
      </form>
    </ActionDialog>
  );
};

/** A domain's ⋯ menu, with Remove domain: on its row in Domains and on its page. */
export const DomainMenu = ({
  domain,
  onRemove,
  triggerRef,
}: {
  domain: SendingDomain;
  onRemove: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) => (
  <DropdownMenu>
    <DropdownMenu.Trigger
      className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-kumo-strong hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus data-popup-open:bg-kumo-tint"
      render={
        <button
          aria-label={`More for ${domain.domain}`}
          ref={triggerRef}
          type="button"
        />
      }
    >
      <DotsThreeIcon aria-hidden="true" className="size-5" weight="bold" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" className="min-w-44 rounded-xl">
      <DropdownMenu.Item icon={TrashIcon} onClick={onRemove} variant="danger">
        Remove domain
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu>
);
