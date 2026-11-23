import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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

import { authClient } from "../auth/auth-client.ts";
import { SetupSteps } from "../home/setup-steps.tsx";
import { AppShell } from "../layout/app-shell.tsx";
import { SignedInOnly } from "../layout/session-gates.tsx";
import {
  OrganizationsProvider,
  useCreateOrganization,
  useOrganizations,
} from "./organizations.tsx";
import { ACME, BOLT, renderWithOrganizations } from "./test-organizations.tsx";

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

const GRACE_SESSION = {
  session: { expiresAt: "2026-12-01T00:00:00.000Z", id: "t", userId: "g" },
  user: {
    email: "grace@example.com",
    emailVerified: true,
    id: "g",
    name: "Grace",
  },
};

const LATE = {
  id: "org_01h455vb4pex5vsknk084sn02s",
  name: "Late Gazette",
  role: "owner",
} as const;

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
    localStorage.clear();
    sessionStorage.clear();
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
    expect(
      screen.getByRole("button", { name: "Account: Ada, ada@example.com" })
    ).toBeDefined();
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

  it("never shows a create that answers after sign-out in the next account's organizations", async () => {
    let session: typeof SESSION | typeof GRACE_SESSION | null = SESSION;
    let createAsked = false;
    let answerCreate = false;
    let createSettled = false;
    let graceLists = 0;
    const shown = new Set<string>();

    api.use(
      http.get("*/api/auth/get-session", () => HttpResponse.json(session)),
      http.get("*/api/organizations", async () => {
        if (session === SESSION) {
          return HttpResponse.json([ACME]);
        }

        // WARNING: a refetch that answers at once replaces what the late create wrote before React draws it, so Grace's lists after her first wait until it has drawn, or for a second if it never does.
        graceLists += 1;

        if (graceLists > 1) {
          await vi
            .waitUntil(() => shown.has(LATE.name), { timeout: 1000 })
            .catch(() => {});
        }

        return HttpResponse.json([BOLT]);
      }),
      http.post("*/api/organizations", async () => {
        createAsked = true;
        await vi.waitUntil(() => answerCreate, { timeout: 5000 });

        return HttpResponse.json(LATE, { status: 201 });
      })
    );

    const Organizations = () => {
      const { organizations } = useOrganizations();
      const create = useCreateOrganization();

      for (const organization of organizations) {
        shown.add(organization.name);
      }

      return (
        <>
          <ul aria-label="Organizations">
            {organizations.map((organization) => (
              <li key={organization.id}>{organization.name}</li>
            ))}
          </ul>
          <button
            onClick={async () => {
              await create.mutateAsync(LATE.name);
              createSettled = true;
            }}
            type="button"
          >
            Create
          </button>
        </>
      );
    };

    const router = createRouter({
      history: createMemoryHistory(),
      routeTree: createRootRoute({
        component: () => (
          <SignedInOnly>
            <OrganizationsProvider>
              <Organizations />
            </OrganizationsProvider>
          </SignedInOnly>
        ),
      }),
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
    act(() => authClient.$store.notify("$sessionSignal"));

    await screen.findByText(ACME.name);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await vi.waitUntil(() => createAsked);

    session = null;
    act(() => authClient.$store.notify("$sessionSignal"));
    await expect
      .poll(() => screen.queryByRole("list", { name: "Organizations" }))
      .toBeNull();

    session = GRACE_SESSION;
    act(() => authClient.$store.notify("$sessionSignal"));
    await screen.findByText(BOLT.name);

    answerCreate = true;
    await vi.waitUntil(() => createSettled);

    expect(shown).not.toContain(LATE.name);
    expect(
      screen.getByRole("list", { name: "Organizations" }).textContent
    ).toBe(BOLT.name);
  });
});
