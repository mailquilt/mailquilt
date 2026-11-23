import { LinkProvider, Sidebar, Toasty } from "@cloudflare/kumo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";

import { RouterLink } from "../layout/router-link.tsx";
import { AccountContext } from "../layout/session-gates.tsx";
import { OrganizationsProvider } from "./organizations.tsx";

export const ACME = {
  id: "org_01h455vb4pex5vsknk084sn02q",
  name: "Acme Newsletter",
  role: "owner",
} as const;

export const BOLT = {
  id: "org_01h455vb4pex5vsknk084sn02r",
  name: "Bolt Weekly",
  role: "owner",
} as const;

const ADA = {
  email: "ada@example.com",
  id: "u",
  instanceAdmin: false,
  name: "Ada",
} as const;

/**
 * Renders `ui` as signed-in pages see it: inside the router, with Kumo's
 * links routed through it, the query client, toasts, the signed-in account
 * and the tab's Organization. Returns the router, so a test can see where a
 * link went.
 */
export const renderWithOrganizations = (ui: React.ReactNode) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routeTree: createRootRoute({
      component: () => (
        <LinkProvider component={RouterLink}>
          <Toasty>
            <AccountContext value={ADA}>
              <OrganizationsProvider>
                <Sidebar.Provider>{ui}</Sidebar.Provider>
              </OrganizationsProvider>
            </AccountContext>
          </Toasty>
        </LinkProvider>
      ),
    }),
  });

  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  return router;
};
