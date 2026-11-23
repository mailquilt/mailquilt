import { DropdownMenu, useSidebar } from "@cloudflare/kumo";
import {
  CaretUpDownIcon,
  GearSixIcon,
  SignOutIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

import type { Account } from "../layout/session-gates.tsx";
import { ThemePicker } from "../theme/theme-picker.tsx";
import { authClient } from "./auth-client.ts";

const initialsOf = (account: Account) => {
  const words = account.name.trim().split(/\s+/u).filter(Boolean);
  const first = words.at(0)?.charAt(0) ?? account.email.charAt(0);
  const last = words.length > 1 ? (words.at(-1)?.charAt(0) ?? "") : "";

  return `${first}${last}`.toUpperCase();
};

const AccountAvatar = ({ account }: { account: Account }) => (
  <span aria-hidden="true" className="mq-avatar">
    {initialsOf(account)}
  </span>
);

const AccountName = ({
  account,
  whole = false,
}: {
  account: Account;
  whole?: boolean;
}) => (
  <span className="flex min-w-0 flex-1 flex-col text-sm leading-4">
    <span
      className={`font-medium text-kumo-strong ${whole ? "break-words" : "truncate"}`}
    >
      {account.name}
    </span>
    <span className={`text-kumo-subtle ${whole ? "break-all" : "truncate"}`}>
      {account.email}
    </span>
  </span>
);

/**
 * Who is signed in, at the foot of the frame. Opens a menu with, for the
 * instance admin, Instance settings, then their appearance setting and, set
 * apart in red, sign-out. The menu is as wide as
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
        className="mq-frame-button"
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
              <AccountName account={account} whole />
            </div>
            <DropdownMenu.Separator />
          </>
        ) : null}
        {account.instanceAdmin ? (
          <>
            <DropdownMenu.LinkItem href="/instance" icon={GearSixIcon}>
              Instance settings
            </DropdownMenu.LinkItem>
            <DropdownMenu.Separator />
          </>
        ) : null}
        <ThemePicker opensAbove={isMobile} />
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
