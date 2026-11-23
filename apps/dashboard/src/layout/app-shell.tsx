import { Sidebar, useSidebar } from "@cloudflare/kumo";
import type { OrganizationId } from "@repo/domain";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useContactPage, useLists } from "../audience/audience-api.ts";
import { formatCount } from "../audience/format.ts";
import { AccountMenu } from "../auth/account-menu.tsx";
import { MailquiltLogo, MailquiltMark } from "../brand/logo.tsx";
import {
  GlobeHemisphereWestIcon,
  HardDrivesIcon,
  HouseIcon,
  LayoutIcon,
  ListBulletsIcon,
  ListIcon,
  MegaphoneIcon,
  SidebarSimpleIcon,
  UsersIcon,
} from "../icons/icons.tsx";
import { OrganizationPatch } from "../organizations/organization-patch.tsx";
import { OrganizationSwitcher } from "../organizations/organization-switcher.tsx";
import { OrganizationsUnavailable } from "../organizations/organizations-unavailable.tsx";
import {
  useOrganizations,
  useOrganizationsStatus,
} from "../organizations/organizations.tsx";
import { useProviderConnections } from "../providers/providers-api.ts";
import { useAccount } from "./session-gates.tsx";

type CountedPage = "contacts" | "lists" | "providers";

interface NavItem {
  readonly label: string;
  readonly icon: typeof HouseIcon;
  readonly href?: string;
  readonly counted?: CountedPage;
}

const NAV: readonly {
  readonly label?: string;
  readonly items: readonly NavItem[];
}[] = [
  { items: [{ href: "/", icon: HouseIcon, label: "Home" }] },
  {
    items: [
      {
        counted: "contacts",
        href: "/contacts",
        icon: UsersIcon,
        label: "Contacts",
      },
      {
        counted: "lists",
        href: "/lists",
        icon: ListBulletsIcon,
        label: "Lists",
      },
    ],
    label: "Audience",
  },
  {
    items: [
      { icon: MegaphoneIcon, label: "Campaigns" },
      { icon: LayoutIcon, label: "Templates" },
    ],
    label: "Send",
  },
  {
    items: [
      {
        counted: "providers",
        href: "/providers",
        icon: HardDrivesIcon,
        label: "Providers",
      },
      { icon: GlobeHemisphereWestIcon, label: "Domains" },
    ],
    label: "Deliverability",
  },
];

type NavCounts = Partial<Record<CountedPage, number>>;

const isCurrent = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

const Navigation = ({ counts }: { counts: NavCounts }) => {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Main">
      {NAV.map((group, index) => (
        <Sidebar.Group key={group.label ?? index}>
          {group.label === undefined ? null : (
            <Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
          )}
          <Sidebar.Menu>
            {group.items.map((item) => {
              if (item.href === undefined) {
                return (
                  <Sidebar.MenuButton
                    className="mq-nav-soon"
                    disabled
                    icon={<item.icon className="mq-nav-icon" />}
                    key={item.label}
                    tooltip={`${item.label}, soon`}
                  >
                    <span className="flex flex-1 items-center justify-between gap-2">
                      {item.label}
                      <Sidebar.MenuBadge>Soon</Sidebar.MenuBadge>
                    </span>
                  </Sidebar.MenuButton>
                );
              }

              const current = isCurrent(pathname, item.href);

              const count =
                item.counted === undefined ? undefined : counts[item.counted];

              const shownCount =
                count === undefined || count === 0
                  ? undefined
                  : formatCount(count);

              return (
                <Sidebar.MenuButton
                  active={current}
                  aria-label={
                    shownCount === undefined
                      ? undefined
                      : `${item.label}, ${shownCount}`
                  }
                  href={item.href}
                  icon={<item.icon className="mq-nav-icon" />}
                  key={item.label}
                  tooltip={item.label}
                >
                  {shownCount === undefined ? (
                    item.label
                  ) : (
                    <span className="flex flex-1 items-center justify-between gap-2">
                      {item.label}
                      <span className="mq-fade-in text-xs text-kumo-subtle tabular-nums">
                        {shownCount}
                      </span>
                    </span>
                  )}
                </Sidebar.MenuButton>
              );
            })}
          </Sidebar.Menu>
        </Sidebar.Group>
      ))}
    </nav>
  );
};

const OrganizationNavigation = ({
  organizationId,
}: {
  organizationId: OrganizationId;
}) => {
  const contacts = useContactPage(organizationId, {});
  const lists = useLists(organizationId);
  const providers = useProviderConnections(organizationId);

  return (
    <Navigation
      counts={{
        contacts: contacts.data?.total,
        lists: lists.data?.length,
        providers: providers.data?.length,
      }}
    />
  );
};

const HomeLink = ({ className }: { className: string }) => (
  <Link aria-label="Mailquilt home" className="rounded-md" to="/">
    <MailquiltLogo className={className} />
  </Link>
);

const FrameHeader = () => {
  const { isMobile, state } = useSidebar();

  if (isMobile) {
    return (
      <>
        <HomeLink className="h-5 w-auto" />
        <Sidebar.Close className="mq-frame-close ml-auto" />
      </>
    );
  }

  const collapsed = state === "collapsed";

  return (
    <>
      {collapsed ? null : <HomeLink className="h-[22px] w-auto" />}
      <Sidebar.Trigger
        className={collapsed ? "group/expand size-9" : "ml-auto"}
      >
        {collapsed ? (
          <MailquiltMark className="size-6 group-hover/expand:hidden group-focus-visible/expand:hidden" />
        ) : null}
        <SidebarSimpleIcon
          aria-hidden="true"
          className={
            collapsed
              ? "hidden size-5 group-hover/expand:block group-focus-visible/expand:block"
              : "size-5"
          }
        />
      </Sidebar.Trigger>
    </>
  );
};

const FrameBar = () => {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  const { active } = useOrganizations();
  const menuButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // WARNING: the closed navigation is inert, so its Close button (or anything else in it) can't keep focus; when focus is lost as it closes, it goes back to the button that opened it, as Escape does.
  useEffect(() => {
    if (openMobile) {
      wasOpen.current = true;

      return;
    }

    if (!wasOpen.current) {
      return;
    }

    wasOpen.current = false;

    const frame = requestAnimationFrame(() => {
      const focus = document.activeElement;

      if (
        focus === null ||
        focus === document.body ||
        focus.closest('[data-sidebar="sidebar"][data-mobile]')
      ) {
        menuButton.current?.focus();
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [openMobile]);

  if (!isMobile) {
    return null;
  }

  return (
    <div className="mq-frame-bar">
      <HomeLink className="h-5 w-auto" />
      {active ? (
        <p className="ml-auto flex min-w-0 items-center gap-2 text-sm font-medium text-kumo-strong">
          <OrganizationPatch className="size-4.5" organizationId={active.id} />
          <span className="truncate">{active.name}</span>
        </p>
      ) : null}
      <button
        aria-expanded={openMobile}
        aria-label="Open navigation"
        className="mq-frame-icon-button"
        onClick={toggleSidebar}
        ref={menuButton}
        type="button"
      >
        <ListIcon aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
};

const PageWrap = ({ children }: { children: React.ReactNode }) => {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const router = useRouter();

  // WARNING: with the full-screen navigation there is no backdrop left to tap, so going to any page has to close it, and focus moves to the page (once it's no longer inert), since the link that had it is gone.
  useEffect(
    () =>
      router.subscribe("onResolved", () => {
        const fromNavigation = document.activeElement?.closest(
          '[data-sidebar="sidebar"][data-mobile]'
        );

        setOpenMobile(false);

        if (fromNavigation) {
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>("#main")
              ?.focus({ preventScroll: true })
          );
        }
      }),
    [router, setOpenMobile]
  );

  return (
    <div className="mq-page-wrap" inert={isMobile && openMobile}>
      {children}
    </div>
  );
};

/**
 * Everything a signed-in person sees: the page set as one light block into
 * the plain ink frame. The frame holds the logo, the Organization, the
 * navigation and their account; it collapses to icons on desktop. Below
 * 1024px it becomes the bar at the top, and the navigation opens full
 * screen. Pages own their own layout.
 */
export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const account = useAccount();
  const { active } = useOrganizations();
  const { status } = useOrganizationsStatus();

  return (
    <Sidebar.Provider
      className="mq-frame-wrapper"
      mobileBreakpoint={1024}
      variant="inset"
    >
      <a className="mq-skip" href="#main">
        Skip to content
      </a>
      <Sidebar className="mq-frame" fullScreenOnMobile>
        <Sidebar.Header className="mq-frame-head">
          <FrameHeader />
        </Sidebar.Header>
        <Sidebar.Content>
          <div className="pb-3 empty:hidden">
            <OrganizationSwitcher />
          </div>
          {active ? (
            <OrganizationNavigation
              key={active.id}
              organizationId={active.id}
            />
          ) : (
            <Navigation counts={{}} />
          )}
        </Sidebar.Content>
        <Sidebar.Footer className="mq-frame-foot">
          <AccountMenu account={account} />
        </Sidebar.Footer>
      </Sidebar>
      <PageWrap>
        <FrameBar />
        <main className="mq-page" id="main" tabIndex={-1}>
          {status === "failed" ? <OrganizationsUnavailable /> : children}
        </main>
      </PageWrap>
    </Sidebar.Provider>
  );
};
