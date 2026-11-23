import { cleanup, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
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

import { SetupSteps } from "../home/setup-steps.tsx";
import { AppShell } from "../layout/app-shell.tsx";
import { SignedInOnly } from "../layout/session-gates.tsx";
import { ACME, renderWithOrganizations } from "./test-organizations.tsx";

const api = setupServer(
  http.get("*/api/organizations/:organizationId/contacts", () =>
    HttpResponse.json({
      contacts: [],
      next: null,
      previous: null,
      start: 0,
      total: 0,
    })
  ),
  http.get("*/api/organizations/:organizationId/lists", () =>
    HttpResponse.json([])
  ),
  http.get("*/api/organizations/:organizationId/provider-connections", () =>
    HttpResponse.json([])
  )
);

const SESSION = {
  session: { expiresAt: "2026-12-01T00:00:00.000Z", id: "s", userId: "u" },
  user: { email: "ada@example.com", emailVerified: true, id: "u", name: "Ada" },
};

const SignedInShell = () => (
  <SignedInOnly>
    <AppShell>
      <SetupSteps />
    </AppShell>
  </SignedInOnly>
);

describe("organizations", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("shows the signed-in pages only once it knows the person's organizations", async () => {
    let listed = false;
    api.use(
      http.get("*/api/organizations", async () => {
        await vi.waitUntil(() => listed, { timeout: 5000 });

        return HttpResponse.json([ACME]);
      })
    );

    renderWithOrganizations(<SetupSteps />);

    await expect
      .poll(() => screen.queryByRole("status", { name: "Loading" }))
      .not.toBeNull();
    expect(screen.queryByRole("list")).toBeNull();

    listed = true;

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 1 of 5 done",
      })
    ).resolves.toBeDefined();
  });

  it("keeps the sidebar and account while organizations can't be loaded, and says so in the page", async () => {
    api.use(
      http.get("*/api/auth/get-session", () => HttpResponse.json(SESSION)),
      http.get("*/api/organizations", () => HttpResponse.error())
    );

    renderWithOrganizations(<SignedInShell />);

    await expect(
      screen.findByRole("heading", { name: "Your organizations didn’t load" })
    ).resolves.toBeDefined();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Account: Ada" })).toBeDefined();
    expect(
      screen.queryByRole("list", { name: /Steps to your first campaign/u })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Organization:/u })
    ).toBeNull();
  });

  it("tries again, showing progress and keeping keyboard focus, and fills the page once organizations load", async () => {
    let available = false;
    let listed = false;
    api.use(
      http.get("*/api/auth/get-session", () => HttpResponse.json(SESSION)),
      http.get("*/api/organizations", async () => {
        if (!available) {
          return HttpResponse.error();
        }

        await vi.waitUntil(() => listed, { timeout: 5000 });

        return HttpResponse.json([ACME]);
      })
    );

    renderWithOrganizations(<SignedInShell />);
    const retry = await screen.findByRole("button", { name: "Try again" });

    available = true;
    retry.focus();
    fireEvent.click(retry);

    const trying = await screen.findByRole("button", {
      name: /Trying again…/u,
    });

    expect(trying.getAttribute("aria-disabled")).toBe("true");
    expect(trying).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(trying);

    listed = true;

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 1 of 5 done",
      })
    ).resolves.toBeDefined();
  });
});
