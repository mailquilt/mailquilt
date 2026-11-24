import type {
  Campaign,
  CampaignDraft,
  CampaignId,
  List,
  ListId,
  OrganizationId,
} from "@repo/domain";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Effect, Predicate } from "effect";

import { callApi } from "../api.ts";
import type { CampaignSearch } from "./campaign-search.ts";

const DEFAULT_RETRIES = 3;

/** How often a Campaign that is sending is asked for again, until it's sent. */
export const SENDING_POLL_MS = 2000;

const campaignsKey = (organizationId: OrganizationId) =>
  ["organizations", organizationId, "campaigns"] as const;

const pagesKey = (organizationId: OrganizationId) =>
  [...campaignsKey(organizationId), "pages"] as const;

const campaignKey = (organizationId: OrganizationId, campaignId: CampaignId) =>
  [...campaignsKey(organizationId), "one", campaignId] as const;

// WARNING: the same keys as `useLists` in audience-api.ts, so a List already loaded there draws at once here, and adding Contacts refreshes both.
const listsKey = (organizationId: OrganizationId) =>
  ["organizations", organizationId, "audience", "lists"] as const;

const retryUnlessSignedOut = (failures: number, error: Error) =>
  !Predicate.isTagged(error, "SignInRequired") && failures < DEFAULT_RETRIES;

/**
 * One page of the Organization's Campaigns, newest first. While another page
 * loads, the last one stays in place. While any Campaign on it is sending, it
 * is asked for again every couple of seconds, so its status moves on to Sent.
 */
export const useCampaignPage = (
  organizationId: OrganizationId,
  search: CampaignSearch
) =>
  useQuery({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      callApi(
        (client) =>
          client.campaigns.list({ params: { organizationId }, query: search }),
        signal
      ),
    queryKey: [...pagesKey(organizationId), search],
    refetchInterval: (query) =>
      query.state.data?.campaigns.some(
        (campaign) => campaign.status === "sending"
      ) === true
        ? SENDING_POLL_MS
        : false,
    retry: retryUnlessSignedOut,
  });

/**
 * One Campaign, or `null` when the Organization has no such Campaign: a
 * definite answer, so it isn't retried as a failure would be. While it is
 * sending, it is asked for again every couple of seconds until it's sent.
 */
export const useCampaign = (
  organizationId: OrganizationId,
  campaignId: CampaignId
) =>
  useQuery({
    queryFn: ({ signal }) =>
      callApi(
        (client) =>
          client.campaigns
            .get({ params: { campaignId, organizationId } })
            .pipe(
              Effect.catchTag("CampaignNotFound", () => Effect.succeed(null))
            ),
        signal
      ),
    queryKey: campaignKey(organizationId, campaignId),
    refetchInterval: (query) =>
      query.state.data?.status === "sending" ? SENDING_POLL_MS : false,
    retry: retryUnlessSignedOut,
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
    retry: retryUnlessSignedOut,
  });
};

// WARNING: write the Campaign into the cache first; the Campaign page navigated to next would otherwise load it again, or draw the draft it was before sending.
const useKeepCampaign = (organizationId: OrganizationId) => {
  const queryClient = useQueryClient();

  return async (campaign: Campaign) => {
    const key = campaignKey(organizationId, campaign.id);

    await queryClient.cancelQueries({ exact: true, queryKey: key });
    queryClient.setQueryData(key, campaign);

    return queryClient.invalidateQueries({
      queryKey: pagesKey(organizationId),
    });
  };
};

/** Asks again for the pages of Campaigns, such as once one has been sent. */
export const useRefreshCampaignPages = (organizationId: OrganizationId) => {
  const queryClient = useQueryClient();

  return () =>
    queryClient.invalidateQueries({ queryKey: pagesKey(organizationId) });
};

/** Saves a new draft. */
export const useCreateCampaign = (organizationId: OrganizationId) => {
  const keep = useKeepCampaign(organizationId);

  return useMutation({
    mutationFn: (draft: typeof CampaignDraft.Type) =>
      callApi((client) =>
        client.campaigns.create({ params: { organizationId }, payload: draft })
      ),
    onSuccess: keep,
  });
};

/** Replaces a draft's content. */
export const useUpdateCampaign = (
  organizationId: OrganizationId,
  campaignId: CampaignId
) => {
  const keep = useKeepCampaign(organizationId);

  return useMutation({
    mutationFn: (draft: typeof CampaignDraft.Type) =>
      callApi((client) =>
        client.campaigns.update({
          params: { campaignId, organizationId },
          payload: draft,
        })
      ),
    onSuccess: keep,
  });
};

/** Sends a draft now. The API answers with it sending. */
export const useSendCampaign = (
  organizationId: OrganizationId,
  campaignId: CampaignId
) => {
  const keep = useKeepCampaign(organizationId);

  return useMutation({
    mutationFn: () =>
      callApi((client) =>
        client.campaigns.send({ params: { campaignId, organizationId } })
      ),
    onSuccess: keep,
  });
};
