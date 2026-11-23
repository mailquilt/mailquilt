import { LinkProvider, Sidebar } from "@cloudflare/kumo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { RouterLink } from "../layout/router-link.tsx";
import { AccountMenu } from "./account-menu.tsx";

const api = setupServer();

const renderAccountMenu = ({
  instanceAdmin = false,
  sidebarOpen = true,
} = {}) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routeTree: createRootRoute({
      component: () => (
        <LinkProvider component={RouterLink}>
          <Sidebar.Provider defaultOpen={sidebarOpen}>
            <AccountMenu
              account={{
                email: "ada@example.com",
                id: "u",
                instanceAdmin,
                name: "Ada",
              }}
            />
          </Sidebar.Provider>
        </LinkProvider>
      ),
    }),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  return router;
};

describe("account menu", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("offers Instance settings to the instance admin only, without reloading the app", async () => {
    renderAccountMenu();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Account: Ada, ada@example.com",
      })
    );

    expect(
      within(await screen.findByRole("menu")).queryByText("Instance settings")
    ).toBeNull();

    cleanup();
    const router = renderAccountMenu({ instanceAdmin: true });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Account: Ada, ada@example.com",
      })
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Instance settings" })
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/instance")
    );
  });

  it("signs the person out", async () => {
    let signedOut = false;
    api.use(
      http.get("*/api/auth/get-session", () => HttpResponse.json(null)),
      http.post("*/api/auth/sign-out", () => {
        signedOut = true;

        return HttpResponse.json({ success: true });
      })
    );

    renderAccountMenu();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Account: Ada, ada@example.com",
      })
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await expect.poll(() => signedOut).toBe(true);
  });

  it("names who is signed in only when the collapsed sidebar hides it", async () => {
    renderAccountMenu();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Account: Ada, ada@example.com",
      })
    );

    expect(
      within(await screen.findByRole("menu")).queryByText("ada@example.com")
    ).toBeNull();

    cleanup();
    renderAccountMenu({ sidebarOpen: false });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Account: Ada, ada@example.com",
      })
    );

    expect(
      within(await screen.findByRole("menu")).getByText("ada@example.com")
    ).toBeDefined();
  });

  it("says so when signing out fails", async () => {
    api.use(
      http.post("*/api/auth/sign-out", () =>
        HttpResponse.json({ message: "Unavailable" }, { status: 503 })
      )
    );

    renderAccountMenu();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Account: Ada, ada@example.com",
      })
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await expect(
      screen.findByText(
        "Couldn’t sign out. Check your connection, then try again."
      )
    ).resolves.toBeDefined();
  });
});
