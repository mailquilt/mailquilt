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
import { SignInForm } from "../auth/sign-in-form.tsx";
import { SignedInOnly, SignedOutOnly, useAccount } from "./session-gates.tsx";

const api = setupServer();

const SESSION = {
  session: { expiresAt: "2026-12-01T00:00:00.000Z", id: "s", userId: "u" },
  user: { email: "ada@example.com", emailVerified: true, id: "u", name: "Ada" },
};

const Home = () => <p>Home for {useAccount().name}</p>;

const renderAt = (path: string) => {
  const root = createRootRoute({ component: Outlet });

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: root.addChildren([
      createRoute({
        component: () => (
          <SignedInOnly>
            <Home />
          </SignedInOnly>
        ),
        getParentRoute: () => root,
        path: "/",
      }),
      createRoute({
        component: () => (
          <SignedOutOnly>
            <SignInForm />
          </SignedOutOnly>
        ),
        getParentRoute: () => root,
        path: "/sign-in",
      }),
    ]),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  // WARNING: the auth client keeps one session store per module; refetch it so each test starts from its own answer.
  act(() => authClient.$store.notify("$sessionSignal"));
};

describe("session gates", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("sends a signed-out person from the app to sign in", async () => {
    api.use(http.get("*/api/auth/get-session", () => HttpResponse.json(null)));

    renderAt("/");

    await expect(
      screen.findByRole("button", { name: "Sign in" })
    ).resolves.toBeDefined();
  });

  it("sends a signed-in person from sign-in into the app", async () => {
    api.use(
      http.get("*/api/auth/get-session", () => HttpResponse.json(SESSION))
    );

    renderAt("/sign-in");

    await expect(screen.findByText("Home for Ada")).resolves.toBeDefined();
  });

  it("takes the person into the app once sign-in succeeds", async () => {
    let signedIn = false;
    api.use(
      http.get("*/api/auth/get-session", () =>
        HttpResponse.json(signedIn ? SESSION : null)
      ),
      http.post("*/api/auth/sign-in/email", () => {
        signedIn = true;

        return HttpResponse.json({
          redirect: false,
          token: "t",
          user: SESSION.user,
        });
      })
    );

    renderAt("/sign-in");
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await expect(screen.findByText("Home for Ada")).resolves.toBeDefined();
  });
});
