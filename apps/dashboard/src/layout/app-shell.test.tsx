import { LinkProvider } from "@cloudflare/kumo";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ACME,
  BOLT,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { AppShell } from "./app-shell.tsx";
import { RouterLink } from "./router-link.tsx";
import { SignedInOnly } from "./session-gates.tsx";

const api = setupServer();

const SESSION = {
  session: { expiresAt: "2026-12-01T00:00:00.000Z", id: "s", userId: "u" },
  user: { email: "ada@example.com", emailVerified: true, id: "u", name: "Ada" },
};

const ADA = {
  createdAt: "2026-11-21T09:00:00.000Z",
  email: "ada@example.com",
  id: "cnt_01h455vb4pex5vsknk084sn02q",
  subscriptions: [],
};

const ORGANIZATION = "*/api/organizations/:organizationId";

const signedIn = [
  http.get("*/api/auth/get-session", () => HttpResponse.json(SESSION)),
  http.get("*/api/organizations", () => HttpResponse.json([ACME])),
];

const quietOrganization = [
  http.get(`${ORGANIZATION}/campaigns`, () =>
    HttpResponse.json({
      campaigns: [],
      next: null,
      previous: null,
      start: 0,
      total: 0,
    })
  ),
  http.get(`${ORGANIZATION}/lists`, () => HttpResponse.json([])),
  http.get(`${ORGANIZATION}/provider-connections`, () => HttpResponse.json([])),
  http.get(`${ORGANIZATION}/contacts`, () =>
    HttpResponse.json({
      contacts: [],
      next: null,
      previous: null,
      start: 0,
      total: 0,
    })
  ),
];

const contactsPage = (total: number) => ({
  contacts: [ADA],
  next: ADA.id,
  previous: null,
  start: 0,
  total,
});

const renderShell = () =>
  renderWithOrganizations(
    <LinkProvider component={RouterLink}>
      <SignedInOnly>
        <AppShell>
          <p>Page</p>
        </AppShell>
      </SignedInOnly>
    </LinkProvider>
  );

// WARNING: the loading frame's own menu button is inert, which happy-dom ignores, so wait for the loaded bar, which names the Organization.
const loadedMenuButton = async () => {
  await screen.findAllByText(ACME.name, {}, { timeout: 3000 });

  return screen.getByRole("button", { name: "Open navigation" });
};

describe("app shell", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
    window.happyDOM?.setViewport({ height: 768, width: 1024 });
  });

  afterAll(() => api.close());

  it("counts what a built page holds beside it, and leaves out a count that's none or couldn't load", async () => {
    let listsAnswered = false;
    let providersAnswered = false;
    api.use(
      ...signedIn,
      http.get(`${ORGANIZATION}/campaigns`, () =>
        HttpResponse.json({
          campaigns: [],
          next: null,
          previous: null,
          start: 0,
          total: 64,
        })
      ),
      http.get(`${ORGANIZATION}/lists`, () => {
        listsAnswered = true;

        return HttpResponse.error();
      }),
      http.get(`${ORGANIZATION}/provider-connections`, () => {
        providersAnswered = true;

        return HttpResponse.json([]);
      }),
      http.get(`${ORGANIZATION}/contacts`, async () => {
        await vi.waitUntil(() => listsAnswered && providersAnswered);
        await delay(50);

        return HttpResponse.json(contactsPage(12_480));
      })
    );

    renderShell();

    await expect(
      screen.findByRole("link", { name: "Contacts, 12,480" }, { timeout: 3000 })
    ).resolves.toBeDefined();
    expect(screen.getByRole("link", { name: "Campaigns, 64" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Lists" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Providers" })).toBeDefined();
  });

  it("marks a page that isn't built as Soon, and doesn't link it", async () => {
    api.use(...signedIn, ...quietOrganization);

    renderShell();

    const templates = await screen.findByRole(
      "button",
      { name: "Templates Soon" },
      { timeout: 3000 }
    );

    expect(templates.hasAttribute("disabled")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Templates/u })).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toBeDefined();
  });

  it("draws the frame with its navigation while the session and Organizations load, and adds the Organization and account once they have", async () => {
    let listed = false;
    api.use(
      http.get("*/api/auth/get-session", () => HttpResponse.json(SESSION)),
      http.get("*/api/organizations", async () => {
        await vi.waitUntil(() => listed, { timeout: 5000 });

        return HttpResponse.json([ACME]);
      }),
      ...quietOrganization
    );

    renderShell();

    await expect
      .poll(() => screen.queryByRole("link", { name: "Contacts" }))
      .not.toBeNull();
    expect(screen.getByText("Loading")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /^Organization:/u })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /^Account:/u })).toBeNull();

    listed = true;

    await expect(
      screen.findByRole(
        "button",
        { name: /^Organization: Acme Newsletter/u },
        { timeout: 3000 }
      )
    ).resolves.toBeDefined();
  });

  it("closes the full-screen navigation once a page is chosen", async () => {
    window.happyDOM?.setViewport({ height: 844, width: 390 });
    api.use(
      ...signedIn,
      http.get(`${ORGANIZATION}/lists`, () => HttpResponse.json([])),
      http.get(`${ORGANIZATION}/provider-connections`, () =>
        HttpResponse.json([])
      ),
      http.get(`${ORGANIZATION}/contacts`, () =>
        HttpResponse.json(contactsPage(1))
      )
    );

    renderShell();

    const menu = await loadedMenuButton();

    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("link", { name: "Lists" }));

    await expect.poll(() => menu.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps Skip to content out of reach while the full-screen navigation covers the page", async () => {
    window.happyDOM?.setViewport({ height: 844, width: 390 });
    api.use(...signedIn, ...quietOrganization);

    renderShell();

    const menu = await loadedMenuButton();

    const skip = screen.getByRole("link", { name: "Skip to content" });

    expect(skip.closest("[inert]")).toBeNull();

    fireEvent.click(menu);

    await expect.poll(() => skip.closest("[inert]")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Close navigation" })
        .closest("[inert]")
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));

    await expect.poll(() => skip.closest("[inert]")).toBeNull();
  });

  it("gives focus back to the menu button when the navigation's Close button closes it", async () => {
    window.happyDOM?.setViewport({ height: 844, width: 390 });
    api.use(...signedIn, ...quietOrganization);

    renderShell();

    const menu = await loadedMenuButton();

    fireEvent.click(menu);

    const close = screen.getByRole("button", { name: "Close navigation" });

    close.focus();
    fireEvent.click(close);

    await expect.poll(() => document.activeElement).toBe(menu);
  });

  it("moves focus to the page when an Organization is chosen in the full-screen navigation", async () => {
    window.happyDOM?.setViewport({ height: 844, width: 390 });
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME, BOLT])),
      ...signedIn,
      ...quietOrganization
    );

    renderShell();

    fireEvent.click(await loadedMenuButton());
    fireEvent.click(
      screen.getByRole("button", { name: /^Organization: Acme Newsletter/u })
    );
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: /Bolt Weekly/u })
    );

    await expect.poll(() => document.activeElement?.id).toBe("main");
  });
});
