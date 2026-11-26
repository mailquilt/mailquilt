import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { Predicate } from "effect";

import { retryUnlessSignedOut } from "./api.ts";
import { authClient } from "./auth/auth-client.ts";
import { Crash } from "./layout/crash.tsx";
import { routeTree } from "./routeTree.gen";

const sessionEnded = (error: Error) =>
  Predicate.isTagged(error, "SignInRequired");

const checkSessionIfEnded = (error: Error) => {
  if (sessionEnded(error)) {
    authClient.$store.notify("$sessionSignal");
  }
};

/**
 * The dashboard's one query client. A request the API refuses with
 * `SignInRequired` isn't retried, and has the session checked again, so a
 * session that ended anywhere sends the person to sign in through
 * `SignedInOnly` instead of leaving a page or form to report a failure.
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: retryUnlessSignedOut,
      },
    },
    mutationCache: new MutationCache({ onError: checkSessionIfEnded }),
    queryCache: new QueryCache({ onError: checkSessionIfEnded }),
  });

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultErrorComponent: Crash,
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
