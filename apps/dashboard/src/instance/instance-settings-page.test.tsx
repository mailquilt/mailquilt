import type { InstanceSettings } from "@repo/domain";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
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

import { InstanceSettingsPage } from "./instance-settings-page.tsx";

const api = setupServer();

const SETTINGS = "*/api/instance/settings";

const SAVED = {
  from: { email: "accounts@example.com", name: "Example Mail" },
  signsIn: true,
  smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
  source: "settings",
} as const;

const renderPage = () => {
  const root = createRootRoute({ component: Outlet });

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/instance"] }),
    routeTree: root.addChildren([
      createRoute({
        component: InstanceSettingsPage,
        getParentRoute: () => root,
        path: "/instance",
      }),
    ]),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
};

const answerSettings = (settings: typeof InstanceSettings.Encoded) =>
  api.use(http.get(SETTINGS, () => HttpResponse.json(settings)));

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("Instance settings", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("tells someone who isn't the instance admin that the settings aren't theirs", async () => {
    api.use(
      http.get(SETTINGS, () =>
        HttpResponse.json({ _tag: "InstanceAdminRequired" }, { status: 403 })
      )
    );
    renderPage();

    await expect(
      screen.findByText(
        "Only the person who runs this Mailquilt can see or change its settings."
      )
    ).resolves.toBeDefined();
    expect(screen.queryByText("Who can sign up")).toBeNull();
  });

  it("opens sign-up to anyone with the address", async () => {
    let saved: unknown;
    answerSettings({ signUp: "invite-only", systemMailer: SAVED });
    api.use(
      http.put(`${SETTINGS}/sign-up`, async ({ request }) => {
        saved = await request.json();

        return HttpResponse.json({ signUp: "open", systemMailer: SAVED });
      })
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("radio", { name: /^Anyone with the address/u })
    );
    fireEvent.click(
      within(screen.getByRole("region", { name: "Who can sign up" })).getByRole(
        "button",
        { name: "Save changes" }
      )
    );

    const confirmation = await screen.findByText("Saved");

    expect(document.activeElement).toBe(confirmation.closest("output"));
    expect(saved).toStrictEqual({ signUp: "open" });
  });

  it("adds the server account emails go out through, with its sign-in", async () => {
    let saved: unknown;
    answerSettings({ signUp: "invite-only", systemMailer: null });
    api.use(
      http.put(`${SETTINGS}/system-mailer`, async ({ request }) => {
        saved = await request.json();

        return HttpResponse.json({
          signUp: "invite-only",
          systemMailer: SAVED,
        });
      })
    );
    renderPage();

    await expect(
      screen.findByText("Account emails aren’t being sent.")
    ).resolves.toBeDefined();

    type("Host", "smtp.example.com");
    type("Username", "user");
    type("Password", "secret");
    type("From email", "accounts@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Save server" }));

    await expect(
      screen.findByText(
        "Saved. Account emails now go out through smtp.example.com."
      )
    ).resolves.toBeDefined();
    expect(saved).toStrictEqual({
      credentials: { password: "secret", username: "user" },
      from: { email: "accounts@example.com" },
      smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
    });

    type("Host", "smtp.changed.example");

    await expect
      .poll(() =>
        screen.queryByText(
          "Saved. Account emails now go out through smtp.example.com."
        )
      )
      .toBeNull();
  });

  it("shows a server set by environment variables, with nothing to change", async () => {
    answerSettings({
      signUp: "invite-only",
      systemMailer: { ...SAVED, source: "environment" },
    });
    renderPage();

    await expect(
      screen.findByText("Set on the server.")
    ).resolves.toBeDefined();
    expect(
      screen.getByText("smtp.example.com, port 587, STARTTLS")
    ).toBeDefined();
    expect(screen.queryByLabelText("Host")).toBeNull();
  });
});
