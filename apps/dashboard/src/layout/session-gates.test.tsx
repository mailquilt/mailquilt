import { Sidebar } from "@cloudflare/kumo";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
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

import { callApi } from "../api.ts";
import { AccountMenu } from "../auth/account-menu.tsx";
import { authClient } from "../auth/auth-client.ts";
import { SignInForm } from "../auth/sign-in-form.tsx";
import { createQueryClient } from "../router.tsx";
import { SignedInOnly, SignedOutOnly, useAccount } from "./session-gates.tsx";

const api = setupServer();

const SESSION = {
  session: { expiresAt: "2026-12-01T00:00:00.000Z", id: "s", userId: "u" },
  user: { email: "ada@example.com", emailVerified: true, id: "u", name: "Ada" },
};

const Home = () => {
  const account = useAccount();

  return (
    <Sidebar.Provider>
      <p>Home for {account.name}</p>
      <AccountMenu account={account} />
    </Sidebar.Provider>
  );
};

const Organizations = () => {
  const list = useQuery({
    queryFn: ({ signal }) =>
      callApi((client) => client.organizations.list(), signal),
    queryKey: ["organizations"],
  });

  const create = useMutation({
    mutationFn: () =>
      callApi((client) =>
        client.organizations.create({ payload: { name: "Acme Weekly" } })
      ),
  });

  return (
    <>
      <p>{list.isSuccess ? "Organizations loaded" : "Loading organizations"}</p>
      <button onClick={() => create.mutate()} type="button">
        Create organization
      </button>
    </>
  );
};

const renderAt = (path: string, queryClient = new QueryClient()) => {
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
          <SignedInOnly>
            <Organizations />
          </SignedInOnly>
        ),
        getParentRoute: () => root,
        path: "/organizations",
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
    <QueryClientProvider client={queryClient}>
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

  it("sends the person to sign in once sign-out succeeds", async () => {
    let signedIn = true;
    api.use(
      http.get("*/api/auth/get-session", () =>
        HttpResponse.json(signedIn ? SESSION : null)
      ),
      http.post("*/api/auth/sign-out", () => {
        signedIn = false;

        return HttpResponse.json({ success: true });
      })
    );

    renderAt("/");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Account: Ada, ada@example.com",
      })
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await expect(
      screen.findByRole("button", { name: "Sign in" })
    ).resolves.toBeDefined();
  });

  it("forgets what it loaded for the person once their session ends, wherever it ended", async () => {
    let signedIn = true;
    api.use(
      http.get("*/api/auth/get-session", () =>
        HttpResponse.json(signedIn ? SESSION : null)
      )
    );
    const queryClient = new QueryClient();

    renderAt("/", queryClient);
    await screen.findByText("Home for Ada");
    queryClient.setQueryData(["organizations"], [{ name: "Acme" }]);

    signedIn = false;
    act(() => authClient.$store.notify("$sessionSignal"));

    await expect(
      screen.findByRole("button", { name: "Sign in" })
    ).resolves.toBeDefined();
    expect(queryClient.getQueryData(["organizations"])).toBeUndefined();
  });

  it.each([
    { listed: false, request: "a page's load" },
    { listed: true, request: "a save" },
  ])(
    "sends the person to sign in when $request finds their session has ended",
    async ({ listed }) => {
      let signedIn = true;

      const sessionEnded = () => {
        signedIn = false;

        return HttpResponse.json({ _tag: "SignInRequired" }, { status: 401 });
      };

      api.use(
        http.get("*/api/auth/get-session", () =>
          HttpResponse.json(signedIn ? SESSION : null)
        ),
        http.get("*/api/organizations", () =>
          listed ? HttpResponse.json([]) : sessionEnded()
        ),
        http.post("*/api/organizations", sessionEnded)
      );

      renderAt("/organizations", createQueryClient());

      if (listed) {
        await screen.findByText("Organizations loaded");
        fireEvent.click(
          screen.getByRole("button", { name: "Create organization" })
        );
      }

      await expect(
        screen.findByRole("button", { name: "Sign in" })
      ).resolves.toBeDefined();
    }
  );

  it("offers a retry instead of signing the person out when the session check fails", async () => {
    let available = false;
    api.use(
      http.get("*/api/auth/get-session", () =>
        available
          ? HttpResponse.json(SESSION)
          : HttpResponse.json({ message: "Unavailable" }, { status: 503 })
      )
    );

    renderAt("/");
    const retry = await screen.findByRole("button", { name: "Try again" });

    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();

    available = true;
    fireEvent.click(retry);

    await expect(screen.findByText("Home for Ada")).resolves.toBeDefined();
  });
});
