import { DropdownMenu, useSidebar } from "@cloudflare/kumo";
import { CaretUpDownIcon, SignOutIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

import type { Account } from "../layout/session-gates.tsx";
import { ThemePicker } from "../theme/theme-picker.tsx";
import { authClient } from "./auth-client.ts";

const initialOf = (account: Account) =>
  (account.name.trim() || account.email).charAt(0).toUpperCase();

const AccountAvatar = ({ account }: { account: Account }) => (
  <span
    aria-hidden="true"
    className="flex size-8 shrink-0 items-center justify-center rounded-quilt bg-(--mq-block-ink) font-display text-sm font-semibold text-kumo-inverse"
  >
    {initialOf(account)}
  </span>
);

const AccountName = ({ account }: { account: Account }) => (
  <span className="flex min-w-0 flex-1 flex-col text-sm leading-4">
    <span className="truncate font-medium text-kumo-strong">
      {account.name}
    </span>
    <span className="truncate text-kumo-subtle">{account.email}</span>
  </span>
);

/**
 * Who is signed in, at the foot of the sidebar. Opens a menu with their
 * appearance setting and, set apart in red, sign-out. The menu is as wide as
 * the sidebar and opens above it. When the sidebar is collapsed to icons, the
 * trigger is only an initial, so the menu opens beside it and starts with the
 * name and email. Signing out ends the session; the app shell then sends them
 * to sign-in.
 */
export const AccountMenu = ({ account }: { account: Account }) => {
  const { isMobile, state } = useSidebar();
  const besideCollapsedSidebar = !isMobile && state === "collapsed";

  const signOut = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();

      if (error) {
        throw new Error(error.message ?? "Sign-out failed");
      }
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        aria-label={`Account: ${account.name}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg p-1 text-left group-data-[state=collapsed]/sidebar:flex-none hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus data-popup-open:bg-kumo-tint"
      >
        <AccountAvatar account={account} />
        {besideCollapsedSidebar ? null : <AccountName account={account} />}
        <CaretUpDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-kumo-subtle group-data-[state=collapsed]/sidebar:hidden"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align={besideCollapsedSidebar ? "end" : "start"}
        className={
          besideCollapsedSidebar
            ? "w-60 rounded-xl"
            : "w-(--anchor-width) rounded-xl"
        }
        side={besideCollapsedSidebar ? "right" : "top"}
      >
        {besideCollapsedSidebar ? (
          <>
            <div className="flex items-center gap-2.5 px-2 pt-1.5 pb-2">
              <AccountAvatar account={account} />
              <AccountName account={account} />
            </div>
            <DropdownMenu.Separator />
          </>
        ) : null}
        <ThemePicker />
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          closeOnClick={false}
          disabled={signOut.isPending}
          icon={SignOutIcon}
          onClick={() => signOut.mutate()}
          variant="danger"
        >
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </DropdownMenu.Item>
        {signOut.isError ? (
          <p
            className="px-2 pt-1 pb-1.5 text-base text-kumo-danger"
            role="alert"
          >
            Couldn’t sign out. Check your connection, then try again.
          </p>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
