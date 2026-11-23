import { DropdownMenu, useSidebar } from "@cloudflare/kumo";
import { CaretUpDownIcon } from "@phosphor-icons/react";
import { useId, useRef } from "react";

import { ActionDialog, useDialog } from "../layout/action-dialog.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { CreateOrganizationForm } from "./create-organization-form.tsx";
import { NewPatchSlot, OrganizationPatch } from "./organization-patch.tsx";
import { useCreateOrganization, useOrganizations } from "./organizations.tsx";
import { ROLE_LABELS } from "./roles.tsx";

const MENU_ROW = "gap-2.5 py-1";

/**
 * The Organization this tab works in, at the top of the frame, with the
 * person's role in it under its name. Its menu switches to another one or creates a new one.
 * Hidden until the person has an Organization: the home page asks them to
 * name their first.
 */
export const OrganizationSwitcher = () => {
  const { active, organizations, switchTo } = useOrganizations();
  const { isMobile, state } = useSidebar();
  const toasts = useConfirmationToast();
  const creating = useDialog();
  const create = useCreateOrganization();
  const formId = useId();
  const switcherButton = useRef<HTMLButtonElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const besideCollapsedSidebar = !isMobile && state === "collapsed";

  if (!active) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          ref={switcherButton}
          aria-label={`Organization: ${active.name}, ${ROLE_LABELS[active.role]}`}
          className="mq-frame-button"
        >
          <OrganizationPatch className="size-6" organizationId={active.id} />
          <span className="flex min-w-0 flex-1 flex-col text-sm leading-4 group-data-[state=collapsed]/sidebar:hidden">
            <span className="truncate font-semibold text-kumo-strong">
              {active.name}
            </span>
            <span className="truncate text-xs text-kumo-subtle">
              {ROLE_LABELS[active.role]}
            </span>
          </span>
          <CaretUpDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-kumo-subtle group-data-[state=collapsed]/sidebar:hidden"
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          align="start"
          className={
            besideCollapsedSidebar
              ? "w-64 rounded-xl"
              : "w-(--anchor-width) rounded-xl"
          }
          side={besideCollapsedSidebar ? "right" : "bottom"}
        >
          <DropdownMenu.Group>
            <DropdownMenu.Label className="pt-1 pb-1 font-medium text-kumo-subtle">
              Switch organization
            </DropdownMenu.Label>
            <DropdownMenu.RadioGroup value={active.id}>
              {organizations.map((organization) => (
                <DropdownMenu.RadioItem
                  closeOnClick
                  className={MENU_ROW}
                  key={organization.id}
                  onClick={() => switchTo(organization.id)}
                  value={organization.id}
                >
                  <OrganizationPatch
                    className="size-6"
                    organizationId={organization.id}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="leading-4.5 font-medium break-words text-kumo-strong">
                      {organization.name}
                    </span>
                    <span className="text-xs leading-4 text-kumo-subtle">
                      {ROLE_LABELS[organization.role]}
                    </span>
                  </span>
                  <DropdownMenu.RadioItemIndicator />
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Group>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            className={MENU_ROW}
            onClick={() => {
              create.reset();
              creating.setOpen(true);
            }}
          >
            <NewPatchSlot className="size-6" />
            <span className="leading-4.5 font-medium text-kumo-strong">
              New organization
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
      <ActionDialog
        actionLabel="Create organization"
        busy={create.isPending}
        description="Make one for each brand or newsletter you send for. Its contacts, campaigns and sending settings stay separate from your others."
        finalFocus={switcherButton}
        formId={formId}
        initialFocus={nameField}
        key={creating.key}
        onExited={creating.handleExited}
        onOpenChange={creating.handleOpenChange}
        open={creating.open}
        title="New organization"
      >
        <CreateOrganizationForm
          create={create}
          fieldRef={nameField}
          id={formId}
          layout="dialog"
          onCreated={(created) => {
            creating.setOpen(false);
            toasts.add({
              description: "You’re working in it now.",
              title: `Created ${created.name}`,
            });
          }}
        />
      </ActionDialog>
    </>
  );
};
