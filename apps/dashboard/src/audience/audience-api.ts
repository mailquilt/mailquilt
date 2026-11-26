import type {
  ContactId,
  ListId,
  OrganizationId,
  SuppressionId,
} from "@repo/domain";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Effect } from "effect";

import { callApi } from "../api.ts";
import type { ContactSearch } from "./contact-search.ts";
import type { SuppressionSearch } from "./suppression-search.ts";

const audienceKey = (organizationId: OrganizationId) =>
  ["organizations", organizationId, "audience"] as const;

const contactsKey = (organizationId: OrganizationId) =>
  [...audienceKey(organizationId), "contacts"] as const;

const listsKey = (organizationId: OrganizationId) =>
  [...audienceKey(organizationId), "lists"] as const;

const suppressionsKey = (organizationId: OrganizationId) =>
  [...audienceKey(organizationId), "suppressions"] as const;

/**
 * One page of the Organization's Contacts for `search`. While another page or
 * filter loads, the last page stays in place, so the table never empties and
 * refills. `null` when the Organization has no such List: a definite answer,
 * so it isn't retried as a failure would be.
 */
export const useContactPage = (
  organizationId: OrganizationId,
  search: ContactSearch
) =>
  useQuery({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      callApi(
        (client) =>
          client.contacts
            .list({ params: { organizationId }, query: search })
            .pipe(Effect.catchTag("ListNotFound", () => Effect.succeed(null))),
        signal
      ),
    queryKey: [...contactsKey(organizationId), search],
  });

/** Every List in the Organization, oldest first, with its counts. */
export const useLists = (organizationId: OrganizationId) =>
  useQuery({
    queryFn: ({ signal }) =>
      callApi(
        (client) => client.lists.list({ params: { organizationId } }),
        signal
      ),
    queryKey: listsKey(organizationId),
  });

const useRefreshAudience = (organizationId: OrganizationId) => {
  const queryClient = useQueryClient();

  return () =>
    queryClient.invalidateQueries({ queryKey: audienceKey(organizationId) });
};

/** Adds a Contact, subscribed to the chosen Lists. */
export const useCreateContact = (organizationId: OrganizationId) => {
  const refresh = useRefreshAudience(organizationId);

  return useMutation({
    mutationFn: (contact: {
      readonly email: string;
      readonly listIds: readonly ListId[];
    }) =>
      callApi((client) =>
        client.contacts.create({ params: { organizationId }, payload: contact })
      ),
    onSuccess: refresh,
  });
};

/** Creates a List. */
export const useCreateList = (organizationId: OrganizationId) => {
  const refresh = useRefreshAudience(organizationId);

  return useMutation({
    mutationFn: (name: string) =>
      callApi((client) =>
        client.lists.create({ params: { organizationId }, payload: { name } })
      ),
    onSuccess: refresh,
  });
};

/** Subscribes Contacts to a List, leaving existing Subscriptions as they are. */
export const useAddToList = (organizationId: OrganizationId) => {
  const refresh = useRefreshAudience(organizationId);

  return useMutation({
    mutationFn: ({
      contactIds,
      listId,
    }: {
      readonly listId: ListId;
      readonly contactIds: readonly [ContactId, ...ContactId[]];
    }) =>
      callApi((client) =>
        client.lists.addContacts({
          params: { listId, organizationId },
          payload: { contactIds },
        })
      ),
    onSuccess: refresh,
  });
};

/**
 * One page of the Organization's Suppressions, newest first. While another
 * page loads, the last one stays in place.
 */
export const useSuppressionPage = (
  organizationId: OrganizationId,
  search: SuppressionSearch
) =>
  useQuery({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      callApi(
        (client) =>
          client.suppressions.list({
            params: { organizationId },
            query: search,
          }),
        signal
      ),
    queryKey: [...suppressionsKey(organizationId), search],
  });

const suppressAddresses = (
  organizationId: OrganizationId,
  emails: readonly [string, ...string[]]
) =>
  callApi((client) =>
    client.suppressions.add({ params: { organizationId }, payload: { emails } })
  );

/**
 * Suppresses one import's batch of up to 250 addresses, without asking for
 * the Suppressions again after each: the import does that once at the end.
 */
export const useSuppressBatch = (organizationId: OrganizationId) =>
  useMutation({
    mutationFn: (emails: readonly [string, ...string[]]) =>
      suppressAddresses(organizationId, emails),
  });

/** Asks for the Suppressions again, after some were added. */
export const useRefreshSuppressions = (organizationId: OrganizationId) => {
  const queryClient = useQueryClient();

  return () =>
    queryClient.invalidateQueries({
      queryKey: suppressionsKey(organizationId),
    });
};

/** Suppresses addresses typed or pasted in, up to 250. */
export const useSuppressAddresses = (organizationId: OrganizationId) => {
  const refresh = useRefreshSuppressions(organizationId);

  return useMutation({
    mutationFn: (emails: readonly [string, ...string[]]) =>
      suppressAddresses(organizationId, emails),
    onSuccess: refresh,
  });
};

/** Removes a Suppression added by hand. One already gone counts as removed. */
export const useRemoveSuppression = (organizationId: OrganizationId) => {
  const refresh = useRefreshSuppressions(organizationId);

  return useMutation({
    mutationFn: (suppressionId: SuppressionId) =>
      callApi((client) =>
        client.suppressions
          .remove({ params: { organizationId, suppressionId } })
          .pipe(Effect.catchTag("SuppressionNotFound", () => Effect.void))
      ),
    onSuccess: refresh,
  });
};
