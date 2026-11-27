import type {
  NewSendingDomain,
  OrganizationId,
  SendingDomain,
  SendingDomainId,
} from "@repo/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Array as Arr, Effect, Order } from "effect";

import { callApi, retryUnlessSignedOut } from "../api.ts";

/** Where the Organization's Sending Domains are kept in the query cache. Creating an Organization seeds it with an empty list. */
export const sendingDomainsKey = (organizationId: OrganizationId) =>
  ["organizations", organizationId, "sending-domains"] as const;

/**
 * Every Sending Domain in the Organization, in the order of their domains,
 * each with what its last check found. With `retryWhenFailed: false`, a
 * failure isn't retried.
 */
export const useSendingDomains = (
  organizationId: OrganizationId,
  {
    enabled = true,
    retryWhenFailed = true,
  }: { readonly enabled?: boolean; readonly retryWhenFailed?: boolean } = {}
) =>
  useQuery({
    enabled,
    queryFn: ({ signal }) =>
      callApi(
        (client) => client.sendingDomains.list({ params: { organizationId } }),
        signal
      ),
    queryKey: sendingDomainsKey(organizationId),
    retry: retryWhenFailed ? retryUnlessSignedOut : false,
  });

const byDomain = (domains: readonly SendingDomain[]) =>
  Arr.sort(
    domains,
    Order.mapInput(Order.String, (domain: SendingDomain) => domain.domain)
  );

// WARNING: write the change into the cached list first; a page navigated to next would otherwise draw the old list, then the new one.
const useChangeDomains = (organizationId: OrganizationId) => {
  const queryClient = useQueryClient();
  const queryKey = sendingDomainsKey(organizationId);

  return (
    change: (domains: readonly SendingDomain[]) => readonly SendingDomain[]
  ) => {
    queryClient.setQueryData<readonly SendingDomain[]>(queryKey, (cached) =>
      cached === undefined ? cached : change(cached)
    );

    return queryClient.invalidateQueries({ queryKey });
  };
};

/** Adds a Sending Domain, not checked yet. */
export const useAddSendingDomain = (organizationId: OrganizationId) => {
  const changeDomains = useChangeDomains(organizationId);

  return useMutation({
    mutationFn: (domain: typeof NewSendingDomain.Type) =>
      callApi((client) =>
        client.sendingDomains.create({
          params: { organizationId },
          payload: domain,
        })
      ),
    onSuccess: (added) =>
      changeDomains((domains) => byDomain([...domains, added])),
  });
};

/** Checks a Sending Domain's DNS now; what it found replaces the last check in the cached list. */
export const useCheckSendingDomain = (
  organizationId: OrganizationId,
  sendingDomainId: SendingDomainId
) => {
  const changeDomains = useChangeDomains(organizationId);

  return useMutation({
    mutationFn: () =>
      callApi((client) =>
        client.sendingDomains.check({
          params: { organizationId, sendingDomainId },
        })
      ),
    onSuccess: (checked) =>
      changeDomains((domains) =>
        domains.map((domain) => (domain.id === checked.id ? checked : domain))
      ),
  });
};

/** Removes a Sending Domain. One someone else already removed counts as removed. */
export const useRemoveSendingDomain = (organizationId: OrganizationId) => {
  const changeDomains = useChangeDomains(organizationId);

  return useMutation({
    mutationFn: (sendingDomainId: SendingDomainId) =>
      callApi((client) =>
        client.sendingDomains
          .remove({ params: { organizationId, sendingDomainId } })
          .pipe(Effect.catchTag("SendingDomainNotFound", () => Effect.void))
      ),
    onSuccess: (_, removed) =>
      changeDomains((domains) =>
        domains.filter((domain) => domain.id !== removed)
      ),
  });
};
