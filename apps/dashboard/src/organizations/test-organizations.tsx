import { Sidebar, Toasty } from "@cloudflare/kumo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";

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

/**
 * Renders `ui` as signed-in pages see it: inside the router, with the query
 * client, toasts and the tab's Organization.
 */
export const renderWithOrganizations = (ui: React.ReactNode) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routeTree: createRootRoute({
      component: () => (
        <Toasty>
          <OrganizationsProvider>
            <Sidebar.Provider>{ui}</Sidebar.Provider>
          </OrganizationsProvider>
        </Toasty>
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
};
