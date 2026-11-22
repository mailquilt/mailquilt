import { Sidebar } from "@cloudflare/kumo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AccountMenu } from "./account-menu.tsx";

const api = setupServer();

const renderAccountMenu = ({
  instanceAdmin = false,
  sidebarOpen = true,
} = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Sidebar.Provider defaultOpen={sidebarOpen}>
        <AccountMenu
          account={{ email: "ada@example.com", instanceAdmin, name: "Ada" }}
        />
      </Sidebar.Provider>
    </QueryClientProvider>
  );

describe("account menu", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("offers Instance settings to the instance admin only", async () => {
    renderAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: "Account: Ada" }));

    expect(
      within(await screen.findByRole("menu")).queryByText("Instance settings")
    ).toBeNull();

    cleanup();
    renderAccountMenu({ instanceAdmin: true });
    fireEvent.click(screen.getByRole("button", { name: "Account: Ada" }));

    expect(
      within(await screen.findByRole("menu"))
        .getByText("Instance settings")
        .closest("a")
        ?.getAttribute("href")
    ).toBe("/instance");
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
    fireEvent.click(screen.getByRole("button", { name: "Account: Ada" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await expect.poll(() => signedOut).toBe(true);
  });

  it("names who is signed in only when the collapsed sidebar hides it", async () => {
    renderAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: "Account: Ada" }));

    expect(
      within(await screen.findByRole("menu")).queryByText("ada@example.com")
    ).toBeNull();

    cleanup();
    renderAccountMenu({ sidebarOpen: false });
    fireEvent.click(screen.getByRole("button", { name: "Account: Ada" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Account: Ada" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await expect(
      screen.findByText(
        "Couldn’t sign out. Check your connection, then try again."
      )
    ).resolves.toBeDefined();
  });
});
