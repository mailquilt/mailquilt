import { LinkProvider } from "@cloudflare/kumo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { authClient } from "../auth/auth-client.ts";
import { SignInPage } from "../auth/sign-in-page.tsx";
import { SignUpPage } from "../auth/sign-up-page.tsx";
import { RouterLink } from "../layout/router-link.tsx";
import { SignedInOnly } from "../layout/session-gates.tsx";
import { SetupGate } from "./setup-gate.tsx";
import { SetupPage } from "./setup-page.tsx";

const api = setupServer();

const ADMIN = {
  createdAt: "2026-11-22T00:00:00.000Z",
  email: "grace@example.com",
  emailVerified: true,
  id: "u",
  image: null,
  instanceAdmin: true,
  name: "Grace",
  updatedAt: "2026-11-22T00:00:00.000Z",
};

const SESSION = {
  createdAt: "2026-11-22T00:00:00.000Z",
  expiresAt: "2026-12-22T00:00:00.000Z",
  id: "s",
  token: "t",
  updatedAt: "2026-11-22T00:00:00.000Z",
  userId: "u",
};

const InstanceSettingsStandIn = () => {
  const { state } = useLocation();

  return <p>Instance settings{state.justSetUp ? ", welcome" : ""}</p>;
};

const renderAt = (path: string) => {
  const root = createRootRoute({ component: Outlet });

  const signedOut = createRoute({
    component: () => (
      <SetupGate>
        <Outlet />
      </SetupGate>
    ),
    getParentRoute: () => root,
    id: "signed-out",
  });

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: root.addChildren([
      signedOut.addChildren([
        createRoute({
          component: SetupPage,
          getParentRoute: () => signedOut,
          path: "/setup",
        }),
        createRoute({
          component: SignInPage,
          getParentRoute: () => signedOut,
          path: "/sign-in",
        }),
        createRoute({
          component: SignUpPage,
          getParentRoute: () => signedOut,
          path: "/sign-up",
        }),
      ]),
      createRoute({
        component: () => (
          <SignedInOnly>
            <p>Home</p>
          </SignedInOnly>
        ),
        getParentRoute: () => root,
        path: "/",
      }),
      createRoute({
        component: () => (
          <SignedInOnly>
            <InstanceSettingsStandIn />
          </SignedInOnly>
        ),
        getParentRoute: () => root,
        path: "/instance",
      }),
    ]),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <LinkProvider component={RouterLink}>
        <RouterProvider router={router} />
      </LinkProvider>
    </QueryClientProvider>
  );
  // WARNING: the auth client keeps one session store per module; refetch it so each test starts from its own answer.
  act(() => authClient.$store.notify("$sessionSignal"));
};

const answerStatus = (status: { setUp: boolean; signUp: string }) =>
  api.use(
    http.get("*/api/instance", () => HttpResponse.json(status)),
    http.get("*/api/auth/get-session", () => HttpResponse.json(null))
  );

const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "Grace" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "grace@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "an instance admin's password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create admin account" }));
};

describe("first-run setup", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("sends every signed-out page of a fresh install to setup", async () => {
    answerStatus({ setUp: false, signUp: "invite-only" });
    renderAt("/sign-in");

    await expect(
      screen.findByRole("heading", { name: "Set up this Mailquilt" })
    ).resolves.toBeDefined();
  });

  it("makes the admin, signs them in and opens Instance settings with a welcome, even after the app first saw them signed out", async () => {
    let madeAdmin: unknown;
    let signedIn = false;
    answerStatus({ setUp: false, signUp: "invite-only" });
    api.use(
      http.get("*/api/auth/get-session", () =>
        HttpResponse.json(signedIn ? { session: SESSION, user: ADMIN } : null)
      ),
      http.post("*/api/instance/setup", async ({ request }) => {
        madeAdmin = await request.json();

        return new HttpResponse(null, { status: 204 });
      }),
      http.post("*/api/auth/sign-in/email", () => {
        signedIn = true;

        return HttpResponse.json({ redirect: false, token: "t", user: ADMIN });
      })
    );
    renderAt("/");
    await screen.findByLabelText("Your name");
    fillAndSubmit();

    await expect(
      screen.findByText("Instance settings, welcome")
    ).resolves.toBeDefined();
    expect(madeAdmin).toStrictEqual({
      email: "grace@example.com",
      name: "Grace",
      password: "an instance admin's password",
    });
  });

  it("sends the new admin to sign in, saying their account is ready, when its own sign-in fails", async () => {
    answerStatus({ setUp: false, signUp: "invite-only" });
    api.use(
      http.post(
        "*/api/instance/setup",
        () => new HttpResponse(null, { status: 204 })
      ),
      http.post("*/api/auth/sign-in/email", () =>
        HttpResponse.json(
          { code: "TOO_MANY_REQUESTS", message: "Too many requests" },
          { status: 429 }
        )
      )
    );
    renderAt("/setup");
    await screen.findByLabelText("Your name");
    fillAndSubmit();

    await expect(
      screen.findByText(
        "Your admin account is ready. Sign in with it to continue."
      )
    ).resolves.toBeDefined();
  });

  it("sends the new admin to sign in, saying their account is ready, when the network drops during its own sign-in", async () => {
    answerStatus({ setUp: false, signUp: "invite-only" });
    api.use(
      http.post(
        "*/api/instance/setup",
        () => new HttpResponse(null, { status: 204 })
      ),
      http.post("*/api/auth/sign-in/email", () => HttpResponse.error())
    );
    renderAt("/setup");
    await screen.findByLabelText("Your name");
    fillAndSubmit();

    await expect(
      screen.findByText(
        "Your admin account is ready. Sign in with it to continue."
      )
    ).resolves.toBeDefined();
  });

  it("says when someone else finished setup first, and offers sign-in", async () => {
    answerStatus({ setUp: false, signUp: "invite-only" });
    api.use(
      http.post("*/api/instance/setup", () =>
        HttpResponse.json({ _tag: "SetupClosed" }, { status: 409 })
      )
    );
    renderAt("/setup");
    await screen.findByLabelText("Your name");
    fillAndSubmit();

    await expect(
      screen.findByText("Someone else just finished setup.")
    ).resolves.toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await expect(
      screen.findByRole("heading", { name: "Sign in" })
    ).resolves.toBeDefined();
  });

  it("sends anyone who reaches setup after it has run to sign in", async () => {
    answerStatus({ setUp: true, signUp: "invite-only" });
    renderAt("/setup");

    await expect(
      screen.findByRole("heading", { name: "Sign in" })
    ).resolves.toBeDefined();
  });

  it("closes sign-up, and offers no new account at sign-in, while the install is invite-only", async () => {
    answerStatus({ setUp: true, signUp: "invite-only" });
    renderAt("/sign-up");

    await expect(
      screen.findByRole("heading", { name: "Sign-up is closed" })
    ).resolves.toBeDefined();

    fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
    await screen.findByRole("heading", { name: "Sign in" });

    expect(
      screen.queryByRole("link", { name: "Create an account" })
    ).toBeNull();
  });

  it("offers a new account at sign-in while sign-up is open", async () => {
    answerStatus({ setUp: true, signUp: "open" });
    renderAt("/sign-in");

    await expect(
      screen.findByRole("link", { name: "Create an account" })
    ).resolves.toBeDefined();
  });
});
