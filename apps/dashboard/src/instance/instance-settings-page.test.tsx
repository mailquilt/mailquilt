import { Toasty } from "@cloudflare/kumo";
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
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
      }
    >
      <Toasty>
        <RouterProvider router={router} />
      </Toasty>
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

  it("keeps Try again in place, and focused, while it tries again", async () => {
    let failing = true;
    let answer = false;
    api.use(
      http.get(SETTINGS, async () => {
        if (failing) {
          return HttpResponse.error();
        }

        await vi.waitUntil(() => answer, { timeout: 5000 });

        return HttpResponse.json({
          signUp: "invite-only",
          systemMailer: SAVED,
        });
      })
    );
    renderPage();

    const retry = await screen.findByRole(
      "button",
      { name: "Try again" },
      { timeout: 3000 }
    );

    failing = false;
    retry.focus();
    fireEvent.click(retry);

    const trying = await screen.findByRole("button", { name: "Trying again…" });

    expect(trying).toBe(retry);
    expect(document.activeElement).toBe(retry);

    answer = true;

    await expect(
      screen.findAllByText("Who can sign up")
    ).resolves.not.toHaveLength(0);
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

    await expect(
      screen.findByText("Saved who can sign up")
    ).resolves.toBeDefined();
    expect(saved).toStrictEqual({ signUp: "open" });
  });

  it("keeps a choice made while a save is still running, and saves once at a time", async () => {
    let saves = 0;
    let answer: ((value: undefined) => void) | undefined;

    // oxlint-disable-next-line promise/avoid-new -- the test holds this response open and answers it itself.
    const answered = new Promise<undefined>((resolve) => {
      answer = resolve;
    });

    answerSettings({ signUp: "invite-only", systemMailer: SAVED });
    api.use(
      http.put(`${SETTINGS}/sign-up`, async () => {
        saves += 1;
        await answered;

        return HttpResponse.json({ signUp: "open", systemMailer: SAVED });
      })
    );
    renderPage();

    const section = within(
      await screen.findByRole("region", { name: "Who can sign up" })
    );

    fireEvent.click(section.getByRole("radio", { name: /^Anyone/u }));
    fireEvent.click(section.getByRole("button", { name: "Save changes" }));
    await expect.poll(() => saves).toBe(1);

    fireEvent.click(section.getByRole("radio", { name: /^Invite only/u }));
    fireEvent.click(section.getByRole("button", { name: "Saving…" }));
    answer?.(undefined);

    await expect(
      screen.findByText("Saved who can sign up")
    ).resolves.toBeDefined();
    expect(saves).toBe(1);
    expect(
      section
        .getByRole("radio", { name: /^Invite only/u })
        .getAttribute("aria-checked")
    ).toBe("true");
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
      screen.findByText("Saved the account-email server")
    ).resolves.toBeDefined();
    expect(saved).toStrictEqual({
      credentials: { password: "secret", username: "user" },
      from: { email: "accounts@example.com" },
      smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
    });
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
