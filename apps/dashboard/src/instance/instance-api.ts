import type {
  EmailAddress,
  InstanceSettings,
  InstanceStatus,
  PersonName,
  Sender,
  SignUpPolicy,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Predicate, Redacted } from "effect";

import { callApi } from "../api.ts";
import { authClient } from "../auth/auth-client.ts";

const SETTINGS_RETRIES = 3;

const STATUS_KEY = ["instance"] as const;

const SETTINGS_KEY = ["instance", "settings"] as const;

/** Whether first-run setup has run, and who may sign up. Anyone may ask. */
export const useInstanceStatus = () =>
  useQuery({
    retry: 1,
    queryFn: ({ signal }) =>
      callApi((client) => client.instance.status(), signal),
    queryKey: STATUS_KEY,
  });

/** The first account, which runs the install. */
export interface InstanceAdminAccount {
  readonly name: typeof PersonName.Type;
  readonly email: typeof EmailAddress.Type;
  readonly password: string;
}

const signInAfterSetUp = async (account: InstanceAdminAccount) => {
  try {
    const { error } = await authClient.signIn.email({
      email: account.email,
      password: account.password,
    });

    if (error) {
      return "set up" as const;
    }

    // WARNING: a session store read as signed-out before setup keeps that answer until it refetches, and signed-in pages would send the new admin back to sign in.
    await authClient.$store.atoms.session?.get().refetch();

    return "signed in" as const;
  } catch {
    return "set up" as const;
  }
};

/**
 * First-run setup: makes the instance admin, then signs them in. Resolves
 * with whether the sign-in worked, its failure included, since the account
 * exists either way; setup itself failing, such as with `SetupClosed`,
 * rejects.
 */
export const useSetUpInstance = () =>
  useMutation({
    mutationFn: async (account: InstanceAdminAccount) => {
      await callApi((client) =>
        client.instance.setUp({
          payload: { ...account, password: Redacted.make(account.password) },
        })
      );

      return signInAfterSetUp(account);
    },
  });

/**
 * Records in the cached status that setup has run. Signed-out pages send
 * people to setup until it says so, so it changes only once the person has
 * left the setup page, or setup sends them to sign in.
 */
export const useMarkSetUp = () => {
  const queryClient = useQueryClient();

  return () =>
    queryClient.setQueryData<InstanceStatus>(STATUS_KEY, (cached) =>
      cached === undefined ? cached : { ...cached, setUp: true }
    );
};

/** The install's settings. Only the instance admin gets them. */
export const useInstanceSettings = () =>
  useQuery({
    queryFn: ({ signal }) =>
      callApi((client) => client.instance.settings(), signal),
    queryKey: SETTINGS_KEY,
    retry: (failures, error) =>
      !Predicate.isTagged(error, "InstanceAdminRequired") &&
      failures < SETTINGS_RETRIES,
  });

const useSaveSettings = () => {
  const queryClient = useQueryClient();

  return (settings: InstanceSettings) => {
    queryClient.setQueryData(SETTINGS_KEY, settings);
    queryClient.setQueryData<InstanceStatus>(STATUS_KEY, (cached) =>
      cached === undefined ? cached : { ...cached, signUp: settings.signUp }
    );
  };
};

/** Sets who may sign up. */
export const useUpdateSignUp = () => {
  const save = useSaveSettings();

  return useMutation({
    mutationFn: (signUp: SignUpPolicy) =>
      callApi((client) =>
        client.instance.updateSignUp({ payload: { signUp } })
      ),
    onSuccess: save,
  });
};

/**
 * Saves the System Mailer. Credentials left out keep the saved ones; `null`
 * removes them.
 */
export const useUpdateSystemMailer = () => {
  const save = useSaveSettings();

  return useMutation({
    mutationFn: (mailer: {
      readonly from: typeof Sender.Type;
      readonly smtp: typeof SmtpServer.Type;
      readonly credentials?: typeof SmtpCredentials.Type | null;
    }) =>
      callApi((client) =>
        client.instance.updateSystemMailer({ payload: mailer })
      ),
    onSuccess: save,
  });
};
