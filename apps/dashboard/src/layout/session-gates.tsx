import { Loader } from "@cloudflare/kumo";
import { Navigate } from "@tanstack/react-router";
import { createContext, useContext } from "react";

import { authClient } from "../auth/auth-client.ts";

export interface Account {
  readonly name: string;
  readonly email: string;
}

const AccountContext = createContext<Account | null>(null);

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
 * anyone else to sign in.
 */
export const SignedInOnly = ({ children }: { children: React.ReactNode }) => {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-kumo-base">
        <Loader />
      </div>
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
