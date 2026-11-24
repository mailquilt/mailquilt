import { useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { createContext, useContext, useEffect } from "react";

import { authClient } from "../auth/auth-client.ts";
import { FrameLoading } from "./frame.tsx";
import { PageLoadFailed } from "./page-states.tsx";

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  /** Can see and change Instance settings. */
  readonly instanceAdmin: boolean;
}

/** The signed-in person. `SignedInOnly` provides it; tests give it directly. */
export const AccountContext = createContext<Account | null>(null);

/** The signed-in person. Only pages inside `SignedInOnly` can ask. */
export const useAccount = () => {
  const account = useContext(AccountContext);

  if (!account) {
    throw new Error("useAccount must be used inside SignedInOnly");
  }

  return account;
};

/**
 * Renders its pages for a signed-in person and gives them the account; sends
 * anyone else to sign in. If the session can't be checked, it offers a retry
 * rather than treating the person as signed out. When the session ends, here
 * or in another tab, it forgets everything loaded for the person, so whoever
 * signs in next on this browser never sees it.
 */
export const SignedInOnly = ({ children }: { children: React.ReactNode }) => {
  const { data: session, error, isPending, refetch } = authClient.useSession();
  const queryClient = useQueryClient();
  const signedOut = !isPending && !session && !error;

  useEffect(() => {
    if (signedOut) {
      queryClient.clear();
    }
  }, [queryClient, signedOut]);

  if (isPending) {
    return <FrameLoading />;
  }

  if (!session && error) {
    return (
      <PageLoadFailed
        description="Check your connection, then try again. You haven’t been signed out."
        onRetry={() => refetch()}
        title="Mailquilt couldn’t check your session"
      />
    );
  }

  if (!session) {
    return <Navigate replace to="/sign-in" />;
  }

  return <AccountContext value={session.user}>{children}</AccountContext>;
};

/**
 * Renders sign-in and sign-up pages for a signed-out person; sends anyone
 * signed in to the app. A successful sign-in, or a verification finished in
 * another tab, lands here as soon as the session arrives.
 */
export const SignedOutOnly = ({ children }: { children: React.ReactNode }) => {
  const { data: session } = authClient.useSession();

  if (session) {
    return <Navigate replace to="/" />;
  }

  return children;
};
