import { Sidebar } from "@cloudflare/kumo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

/** Renders `ui` as signed-in pages see it: with the query client and the tab's Organization. */
export const renderWithOrganizations = (ui: React.ReactNode) => {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OrganizationsProvider>
        <Sidebar.Provider>{ui}</Sidebar.Provider>
      </OrganizationsProvider>
    </QueryClientProvider>
  );
};
