import { Sidebar, useSidebar } from "@cloudflare/kumo";
import {
  GlobeSimpleIcon,
  HouseSimpleIcon,
  LayoutIcon,
  ListBulletsIcon,
  ListIcon,
  PaperPlaneTiltIcon,
  PlugsConnectedIcon,
  SidebarSimpleIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useLocation } from "@tanstack/react-router";

import { AccountMenu } from "../auth/account-menu.tsx";
import { MailquiltLogo, MailquiltMark } from "../brand/logo.tsx";
import { HealthStatus } from "../health/health-status.tsx";
import { OrganizationSwitcher } from "../organizations/organization-switcher.tsx";
import { useAccount } from "./session-gates.tsx";

const SECTIONS_DIMMED_UNTIL_THEY_EXIST = [
  {
    items: [
      { icon: PaperPlaneTiltIcon, label: "Campaigns" },
      { icon: LayoutIcon, label: "Templates" },
    ],
    label: "Send",
  },
  {
    items: [
      { icon: UsersIcon, label: "Contacts" },
      { icon: ListBulletsIcon, label: "Lists" },
    ],
    label: "Audience",
  },
  {
    items: [
      { icon: PlugsConnectedIcon, label: "Providers" },
      { icon: GlobeSimpleIcon, label: "Domains" },
    ],
    label: "Deliverability",
  },
] as const;

const NAV_ITEM_FOCUS =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kumo-focus";

const SidebarHeaderControls = () => {
  const { isMobile, state } = useSidebar();

  if (isMobile) {
    return (
      <>
        <MailquiltLogo className="h-[22px] w-auto" />
        <Sidebar.Close className="ml-auto" />
      </>
    );
  }

  if (state === "collapsed") {
    return (
      <Sidebar.Trigger className="group/expand mx-auto size-9">
        <MailquiltMark className="size-6 group-hover/expand:hidden group-focus-visible/expand:hidden" />
        <SidebarSimpleIcon
          aria-hidden="true"
          className="hidden size-5 group-hover/expand:block group-focus-visible/expand:block"
        />
      </Sidebar.Trigger>
    );
  }

  return (
    <>
      <MailquiltLogo className="h-[22px] w-auto" />
      <Sidebar.Trigger className="ml-auto" />
    </>
  );
};

const MobileBarOpeningSidebarSheet = () => {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();

  if (!isMobile) {
    return null;
  }

  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-kumo-hairline bg-kumo-base/95 px-4 backdrop-blur">
      <button
        aria-expanded={openMobile}
        aria-label="Open navigation"
        className="flex size-10 items-center justify-center rounded-lg text-kumo-default hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus"
        onClick={toggleSidebar}
        type="button"
      >
        <ListIcon aria-hidden="true" className="size-5" />
      </button>
      <MailquiltLogo className="h-5 w-auto" />
    </div>
  );
};

/**
 * Everything a signed-in person sees: the sidebar with the logo, navigation
 * and their account, and the page beside it. Sections are dimmed until their
 * feature exists, so the structure is learnable from the first day. Pages own
 * their own layout.
 */
export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const account = useAccount();

  return (
    <Sidebar.Provider className="h-svh">
      <Sidebar>
        <Sidebar.Header className="border-b-0 pt-2 pr-3 pl-5 group-data-[state=collapsed]/sidebar:px-0">
          <SidebarHeaderControls />
        </Sidebar.Header>
        <Sidebar.Content>
          <div className="px-2 pt-1 pb-2 group-data-[state=collapsed]/sidebar:flex group-data-[state=collapsed]/sidebar:justify-center">
            <OrganizationSwitcher />
          </div>
          <nav aria-label="Main">
            <Sidebar.Group>
              <Sidebar.Menu>
                <Sidebar.MenuButton
                  active={pathname === "/"}
                  className={NAV_ITEM_FOCUS}
                  href="/"
                  icon={HouseSimpleIcon}
                  tooltip="Home"
                >
                  Home
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>
            {SECTIONS_DIMMED_UNTIL_THEY_EXIST.map((section) => (
              <Sidebar.Group key={section.label}>
                <Sidebar.GroupLabel>
                  <span className="flex items-center justify-between gap-2">
                    {section.label}
                    <span className="rounded-sm bg-kumo-tint px-1.5 text-xs font-medium text-kumo-subtle">
                      Soon
                    </span>
                  </span>
                </Sidebar.GroupLabel>
                <Sidebar.Menu>
                  {section.items.map((item) => (
                    <Sidebar.MenuButton
                      className="cursor-default opacity-45 hover:bg-transparent"
                      disabled
                      icon={item.icon}
                      key={item.label}
                      tooltip={`${item.label} is coming soon`}
                    >
                      {item.label}
                    </Sidebar.MenuButton>
                  ))}
                </Sidebar.Menu>
              </Sidebar.Group>
            ))}
          </nav>
        </Sidebar.Content>
        <Sidebar.Footer className="h-auto py-2.5 group-data-[state=collapsed]/sidebar:justify-center">
          <AccountMenu account={account} />
        </Sidebar.Footer>
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-kumo-base">
        <MobileBarOpeningSidebarSheet />
        <HealthStatus bannerClassName="m-6 md:mx-12" />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </Sidebar.Provider>
  );
};
