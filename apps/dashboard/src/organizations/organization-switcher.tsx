import {
  DropdownMenu,
  useKumoToastManager,
  useSidebar,
} from "@cloudflare/kumo";
import { CaretUpDownIcon } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";

import { ActionDialog } from "../layout/action-dialog.tsx";
import { CreateOrganizationForm } from "./create-organization-form.tsx";
import { NewPatchSlot, OrganizationPatch } from "./organization-patch.tsx";
import { useCreateOrganization, useOrganizations } from "./organizations.tsx";
import { RoleBadge, ROLE_LABELS } from "./roles.tsx";

const MENU_ROW = "gap-2.5 py-1";

/**
 * The Organization this tab works in, at the top of the sidebar, with the
 * person's role in it. Its menu switches to another one or creates a new one.
 * Hidden until the person has an Organization: the home page asks them to
 * name their first.
 */
export const OrganizationSwitcher = () => {
  const { active, organizations, switchTo } = useOrganizations();
  const { isMobile, state } = useSidebar();
  const toasts = useKumoToastManager();
  const [creating, setCreating] = useState(false);
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
          className="flex min-h-8.5 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-left text-sm group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0 hover:bg-kumo-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kumo-focus data-popup-open:bg-kumo-tint"
        >
          <OrganizationPatch className="size-4" organizationId={active.id} />
          <span className="min-w-0 flex-1 truncate font-semibold text-kumo-strong group-data-[state=collapsed]/sidebar:hidden">
            {active.name}
          </span>
          <RoleBadge
            className="group-data-[state=collapsed]/sidebar:hidden"
            role={active.role}
          />
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
              setCreating(true);
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
        onOpenChange={setCreating}
        open={creating}
        title="New organization"
      >
        <CreateOrganizationForm
          create={create}
          fieldRef={nameField}
          id={formId}
          layout="dialog"
          onCreated={(created) => {
            setCreating(false);
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
