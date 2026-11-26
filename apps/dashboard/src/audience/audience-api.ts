import type { ContactId, List, ListId, OrganizationId } from "@repo/domain";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Effect } from "effect";

import { callApi } from "../api.ts";
import type { ContactSearch } from "./contact-search.ts";

const audienceKey = (organizationId: OrganizationId) =>
  ["organizations", organizationId, "audience"] as const;

const contactsKey = (organizationId: OrganizationId) =>
  [...audienceKey(organizationId), "contacts"] as const;

const listsKey = (organizationId: OrganizationId) =>
  [...audienceKey(organizationId), "lists"] as const;

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

/**
 * One List with its counts, or `null` when the Organization no longer has it.
 * It waits until `listId` is known. A List already in the cached list of
 * Lists draws at once, and is checked.
 */
export const useList = (
  organizationId: OrganizationId,
  listId: ListId | undefined
) => {
  const queryClient = useQueryClient();

  return useQuery({
    enabled: listId !== undefined,
    initialData: () =>
      queryClient
        .getQueryData<readonly List[]>(listsKey(organizationId))
        ?.find((list) => list.id === listId),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(listsKey(organizationId))?.dataUpdatedAt,
    queryFn: ({ signal }) =>
      listId === undefined
        ? Promise.resolve(null)
        : callApi(
            (client) =>
              client.lists
                .get({ params: { listId, organizationId } })
                .pipe(
                  Effect.catchTag("ListNotFound", () => Effect.succeed(null))
                ),
            signal
          ),
    queryKey: [...listsKey(organizationId), listId ?? "unknown"],
  });
};

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
