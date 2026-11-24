import { Sidebar, useSidebar } from "@cloudflare/kumo";
import type { Organization } from "@repo/domain";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { formatCount } from "../audience/format.ts";
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
import { PageAreaLoading } from "./page-states.tsx";

type CountedPage = "campaigns" | "contacts" | "lists" | "providers";

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
      {
        counted: "campaigns",
        href: "/campaigns",
        icon: MegaphoneIcon,
        label: "Campaigns",
      },
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

export const Navigation = ({ counts }: { counts: NavCounts }) => {
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

const FrameBar = ({
  loading,
  organization,
}: {
  loading: boolean;
  organization: Organization | null;
}) => {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
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
    <div className="mq-frame-bar" inert={loading}>
      <HomeLink className="h-5 w-auto" />
      {organization ? (
        <p className="ml-auto flex min-w-0 items-center gap-2 text-sm font-medium text-kumo-strong">
          <OrganizationPatch
            className="size-4.5"
            organizationId={organization.id}
          />
          <span className="truncate">{organization.name}</span>
        </p>
      ) : null}
      <button
        aria-expanded={openMobile}
        aria-label="Open navigation"
        className={
          organization ? "mq-frame-icon-button" : "mq-frame-icon-button ml-auto"
        }
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

const SkipLink = ({ loading }: { loading: boolean }) => {
  const { isMobile, openMobile } = useSidebar();

  // WARNING: the skip link sits outside the page it skips to, so it has to go inert with the page while the full-screen navigation covers it, or Tab from the account menu wraps to it and leaves focus nowhere.
  return (
    <a
      className="mq-skip"
      href="#main"
      inert={loading || (isMobile && openMobile)}
    >
      Skip to content
    </a>
  );
};

/**
 * The page set as one light block into the plain ink frame. The frame holds
 * the logo, the Organization switcher, the navigation and the account; it
 * collapses to icons on desktop. Below 1024px it becomes the bar at the top,
 * and the navigation opens full screen.
 *
 * While the person and their Organizations load, it is drawn without the
 * parts that depend on them, and can't be used yet: nothing in it is a guess
 * that changes, so the app fills in around what is already drawn.
 */
export const Frame = ({
  account = null,
  children,
  loading = false,
  navigation,
  organization = null,
  switcher = null,
}: {
  account?: React.ReactNode;
  children: React.ReactNode;
  loading?: boolean;
  navigation: React.ReactNode;
  organization?: Organization | null;
  switcher?: React.ReactNode;
}) => (
  <Sidebar.Provider
    className="mq-frame-wrapper"
    mobileBreakpoint={1024}
    variant="inset"
  >
    <SkipLink loading={loading} />
    <Sidebar className="mq-frame" fullScreenOnMobile inert={loading}>
      <Sidebar.Header className="mq-frame-head">
        <FrameHeader />
      </Sidebar.Header>
      <Sidebar.Content>
        <div className="pb-3 empty:hidden">{switcher}</div>
        {navigation}
      </Sidebar.Content>
      <Sidebar.Footer className="mq-frame-foot">{account}</Sidebar.Footer>
    </Sidebar>
    <PageWrap>
      <FrameBar loading={loading} organization={organization} />
      <main className="mq-page" id="main" tabIndex={-1}>
        {children}
      </main>
    </PageWrap>
  </Sidebar.Provider>
);

const SwitcherSpace = () => (
  <span aria-hidden="true" className="mq-frame-button invisible">
    <span className="size-6" />
    <span className="flex flex-col text-sm leading-4">
      <span>&nbsp;</span>
      <span className="text-xs">&nbsp;</span>
    </span>
  </span>
);

/**
 * The signed-in frame while the session and the Organizations load: the
 * logo, the navigation and an empty page, with the page's loader. The
 * switcher's place is kept, because nearly everyone has an Organization;
 * someone with none yet sees the navigation move up into it.
 */
export const FrameLoading = () => (
  <Frame
    loading
    navigation={<Navigation counts={{}} />}
    switcher={<SwitcherSpace />}
  >
    <PageAreaLoading label="Loading" />
  </Frame>
);
