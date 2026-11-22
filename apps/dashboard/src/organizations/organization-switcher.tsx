import { Dialog, DropdownMenu, useSidebar } from "@cloudflare/kumo";
import { CaretUpDownIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { CreateOrganizationForm } from "./create-organization-form.tsx";
import { useOrganizations } from "./organizations.tsx";

const initialOf = (name: string) => name.trim().charAt(0).toUpperCase();

/**
 * The Organization this tab works in, at the top of the sidebar. Its menu
 * switches to another one or creates a new one. Hidden until the person has
 * an Organization: the home page asks them to name their first.
 */
export const OrganizationSwitcher = () => {
  const { active, organizations, switchTo } = useOrganizations();
  const { isMobile, state } = useSidebar();
  const [creating, setCreating] = useState(false);
  const besideCollapsedSidebar = !isMobile && state === "collapsed";

  if (!active) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          aria-label={`Organization: ${active.name}`}
          className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg p-1 text-left group-data-[state=collapsed]/sidebar:w-auto hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus data-popup-open:bg-kumo-tint"
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-quilt bg-kumo-tint font-display text-sm font-semibold text-kumo-strong ring ring-kumo-line"
          >
            {initialOf(active.name)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-strong group-data-[state=collapsed]/sidebar:hidden">
            {active.name}
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
              ? "w-60 rounded-xl"
              : "w-(--anchor-width) rounded-xl"
          }
          side={besideCollapsedSidebar ? "right" : "bottom"}
        >
          <DropdownMenu.Group>
            <DropdownMenu.Label className="font-medium text-kumo-subtle">
              Organizations
            </DropdownMenu.Label>
            <DropdownMenu.RadioGroup value={active.id}>
              {organizations.map((organization) => (
                <DropdownMenu.RadioItem
                  key={organization.id}
                  onClick={() => switchTo(organization.id)}
                  value={organization.id}
                >
                  <span className="min-w-0 truncate">{organization.name}</span>
                  <DropdownMenu.RadioItemIndicator />
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Group>
          <DropdownMenu.Separator />
          <DropdownMenu.Item icon={PlusIcon} onClick={() => setCreating(true)}>
            New organization
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
      <Dialog.Root onOpenChange={setCreating} open={creating}>
        <Dialog className="flex flex-col gap-6 px-6 py-5 sm:px-8 sm:py-7">
          <div className="flex items-start gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Dialog.Title className="font-display text-xl font-semibold text-kumo-strong">
                New organization
              </Dialog.Title>
              <Dialog.Description className="text-base text-(--mq-body)">
                It has its own contacts, campaigns and sending settings. Switch
                between organizations at the top of the sidebar.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mt-1 -mr-2 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-kumo-default hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus"
            >
              <XIcon aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <CreateOrganizationForm onCreated={() => setCreating(false)} />
        </Dialog>
      </Dialog.Root>
    </>
  );
};
