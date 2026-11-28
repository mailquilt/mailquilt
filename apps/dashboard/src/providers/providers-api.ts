import type {
  OrganizationId,
  ProviderConnection,
  ProviderConnectionId,
  Sender,
  SesAccount,
  SesCredentials,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Effect } from "effect";

import { callApi, retryUnlessSignedOut } from "../api.ts";

/** Where the Organization's Provider Connections are kept in the query cache. Creating an Organization seeds its key with an empty list. */
export const connectionsKey = (organizationId: OrganizationId) =>
  ["organizations", organizationId, "provider-connections"] as const;

/** A Provider Connection's settings as the connect and edit forms send them, without its credentials. */
export type ConnectionSettings = {
  readonly name: string;
  readonly from: typeof Sender.Type;
  /** Its sending rate; `null` for none. */
  readonly emailsPerMinute: number | null;
} & (
  | { readonly provider: "smtp"; readonly smtp: typeof SmtpServer.Type }
  | { readonly provider: "ses"; readonly ses: typeof SesAccount.Type }
);

/**
 * A connection to save: its settings and credentials. Left out, the saved
 * credentials are kept; `null` removes an SMTP server's.
 */
export type ConnectionToSave =
  | (Extract<ConnectionSettings, { readonly provider: "smtp" }> & {
      readonly credentials?: typeof SmtpCredentials.Type | null;
      /** Whether its Campaign emails go from a bounce address; left out, the saved choice is kept. */
      readonly usesBounceAddress?: boolean;
    })
  | (Extract<ConnectionSettings, { readonly provider: "ses" }> & {
      readonly credentials?: typeof SesCredentials.Type;
    });

/**
 * Every Provider Connection in the Organization, oldest first. With
 * `retryWhenFailed: false`, a failure isn't retried.
 */
export const useProviderConnections = (
  organizationId: OrganizationId,
  {
    enabled = true,
    retryWhenFailed = true,
  }: { readonly enabled?: boolean; readonly retryWhenFailed?: boolean } = {}
) =>
  useQuery({
    enabled,
    retry: retryWhenFailed ? retryUnlessSignedOut : false,
    queryFn: ({ signal }) =>
      callApi(
        (client) =>
          client.providerConnections.list({ params: { organizationId } }),
        signal
      ),
    queryKey: connectionsKey(organizationId),
  });

// WARNING: write the change into the cached list first; a page navigated to next would otherwise draw the old list, then the new one.
const useChangeConnections = (organizationId: OrganizationId) => {
  const queryClient = useQueryClient();
  const queryKey = connectionsKey(organizationId);

  return (
    change: (
      connections: readonly ProviderConnection[]
    ) => readonly ProviderConnection[]
  ) => {
    queryClient.setQueryData<readonly ProviderConnection[]>(
      queryKey,
      (cached) => (cached === undefined ? cached : change(cached))
    );

    return queryClient.invalidateQueries({ queryKey });
  };
};

// WARNING: SES always needs its access key, and a new SMTP server without a sign-in leaves `credentials` out rather than sending `null`, which create refuses.
const newConnectionPayload = (connection: ConnectionToSave) => {
  if (connection.provider === "ses") {
    return connection.credentials === undefined
      ? undefined
      : { ...connection, credentials: connection.credentials };
  }

  const { credentials, ...settings } = connection;

  return credentials === undefined || credentials === null
    ? settings
    : { ...settings, credentials };
};

/** Connects an SMTP server or an SES account, with its credentials. */
export const useCreateConnection = (organizationId: OrganizationId) => {
  const changeConnections = useChangeConnections(organizationId);

  return useMutation({
    mutationFn: (connection: ConnectionToSave) =>
      callApi((client) => {
        const payload = newConnectionPayload(connection);

        return payload === undefined
          ? Effect.die(new Error("An SES account needs its access key"))
          : client.providerConnections.create({
              params: { organizationId },
              payload,
            });
      }),
    onSuccess: (created) =>
      changeConnections((connections) => [...connections, created]),
  });
};

/**
 * Changes a connection. Credentials left out keep the saved ones; `null`
 * removes them.
 */
export const useUpdateConnection = (
  organizationId: OrganizationId,
  providerConnectionId: ProviderConnectionId
) => {
  const changeConnections = useChangeConnections(organizationId);

  return useMutation({
    mutationFn: (connection: ConnectionToSave) =>
      callApi((client) =>
        client.providerConnections.update({
          params: { organizationId, providerConnectionId },
          payload: connection,
        })
      ),
    onSuccess: (saved) =>
      changeConnections((connections) =>
        connections.map((connection) =>
          connection.id === saved.id ? saved : connection
        )
      ),
  });
};

/**
 * Deletes a connection and its saved sign-in. One someone else already
 * deleted counts as deleted.
 */
export const useDeleteConnection = (organizationId: OrganizationId) => {
  const changeConnections = useChangeConnections(organizationId);

  return useMutation({
    mutationFn: (providerConnectionId: ProviderConnectionId) =>
      callApi((client) =>
        client.providerConnections
          .delete({ params: { organizationId, providerConnectionId } })
          .pipe(
            Effect.catchTag("ProviderConnectionNotFound", () => Effect.void)
          )
      ),
    onSuccess: (_, deleted) =>
      changeConnections((connections) =>
        connections.filter((connection) => connection.id !== deleted)
      ),
  });
};

/**
 * Makes a connection the one new Campaigns start with, and every other
 * not, in the cached list too.
 */
export const useMakeCampaignDefault = (organizationId: OrganizationId) => {
  const changeConnections = useChangeConnections(organizationId);

  return useMutation({
    mutationFn: (providerConnectionId: ProviderConnectionId) =>
      callApi((client) =>
        client.providerConnections.makeCampaignDefault({
          params: { organizationId, providerConnectionId },
        })
      ),
    onSuccess: (made) =>
      changeConnections((connections) =>
        connections.map((connection) => ({
          ...connection,
          defaultForCampaigns: connection.id === made.id,
        }))
      ),
  });
};

/** Sends a test email through a connection. */
export const useSendTestEmail = (
  organizationId: OrganizationId,
  providerConnectionId: ProviderConnectionId
) =>
  useMutation({
    mutationFn: (to: string) =>
      callApi((client) =>
        client.providerConnections.sendTestEmail({
          params: { organizationId, providerConnectionId },
          payload: { to },
        })
      ),
  });

/**
 * The URL an SES connection's SNS topic posts its bounces and complaints
 * to. It doesn't change, so it's asked for once per page. Only an SES
 * connection has one, so it waits (`enabled`) until the connection is known
 * to be one.
 */
export const useSesNotificationsUrl = (
  organizationId: OrganizationId,
  providerConnectionId: ProviderConnectionId,
  { enabled = true }: { readonly enabled?: boolean } = {}
) =>
  useQuery({
    enabled,
    queryFn: ({ signal }) =>
      callApi(
        (client) =>
          client.providerConnections.sesNotificationsUrl({
            params: { organizationId, providerConnectionId },
          }),
        signal
      ),
    queryKey: [
      ...connectionsKey(organizationId),
      providerConnectionId,
      "ses-notifications-url",
    ],
    staleTime: Number.POSITIVE_INFINITY,
  });
