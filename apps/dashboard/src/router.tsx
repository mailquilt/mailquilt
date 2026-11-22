import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }

  interface HistoryState {
    /**
     * The address a verification link was just sent to. Kept in history
     * state, not the URL, so it never reaches server logs.
     */
    verificationEmail?: string;
    /** Set on the way from first-run setup, to Instance settings (which then welcomes the new instance admin) or, when its sign-in failed, to sign-in. */
    justSetUp?: boolean;
  }
}
