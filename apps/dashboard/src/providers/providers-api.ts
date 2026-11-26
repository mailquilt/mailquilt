import type {
  OrganizationId,
  ProviderConnection,
  ProviderConnectionId,
  Sender,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Effect } from "effect";

import { callApi, retryUnlessSignedOut } from "../api.ts";

/** Where the Organization's Provider Connections are kept in the query cache. Creating an Organization seeds its key with an empty list. */
export const connectionsKey = (organizationId: OrganizationId) =>
  ["organizations", organizationId, "provider-connections"] as const;

/** A Provider Connection's settings as the connect and edit forms send them. */
export interface ConnectionSettings {
  readonly name: string;
  readonly from: typeof Sender.Type;
  readonly smtp: typeof SmtpServer.Type;
}

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

/** Connects an SMTP server, with its sign-in if it needs one. */
export const useCreateConnection = (organizationId: OrganizationId) => {
  const changeConnections = useChangeConnections(organizationId);

  return useMutation({
    mutationFn: (
      connection: ConnectionSettings & {
        readonly credentials?: typeof SmtpCredentials.Type;
      }
    ) =>
      callApi((client) =>
        client.providerConnections.create({
          params: { organizationId },
          payload: connection,
        })
      ),
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
    mutationFn: (
      connection: ConnectionSettings & {
        readonly credentials?: typeof SmtpCredentials.Type | null;
      }
    ) =>
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
