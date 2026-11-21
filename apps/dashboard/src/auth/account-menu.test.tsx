import { Sidebar } from "@cloudflare/kumo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AccountMenu } from "./account-menu.tsx";

const api = setupServer();

const renderAccountMenu = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Sidebar.Provider>
        <AccountMenu account={{ email: "ada@example.com", name: "Ada" }} />
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
