import type {
  Campaign,
  CampaignDraft,
  CampaignId,
  ListId,
  OrganizationId,
} from "@repo/domain";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Array as Arr, Effect, Order } from "effect";

import { callApi } from "../api.ts";
import type { CampaignSearch } from "./campaign-search.ts";

/** How often a Campaign that is sending is asked for again, until it's sent. */
export const SENDING_POLL_MS = 2000;

const campaignsKey = (organizationId: OrganizationId) =>
  ["organizations", organizationId, "campaigns"] as const;

const pagesKey = (organizationId: OrganizationId) =>
  [...campaignsKey(organizationId), "pages"] as const;

const campaignKey = (organizationId: OrganizationId, campaignId: CampaignId) =>
  [...campaignsKey(organizationId), "one", campaignId] as const;

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
  });

/** The Lists a Campaign goes to and leaves out, as the recipient count takes them. */
export interface TargetedLists {
  readonly listIds: readonly ListId[];
  readonly excludedListIds: readonly ListId[];
}

/**
 * How many Contacts a Campaign to these Lists would be sent to now. It waits
 * until at least one List is chosen and `enabled`. After a change, the last
 * count stays as placeholder data (`isPlaceholderData`) until the new one
 * comes, so it can be shown as being counted again, never as current.
 */
export const useRecipientCount = (
  organizationId: OrganizationId,
  lists: TargetedLists,
  enabled = true
) => {
  // WARNING: sorted, so the form and the Campaign page, which list them in different orders, share one cached count.
  const query = {
    excludedListIds: Arr.sort(lists.excludedListIds, Order.String),
    listIds: Arr.sort(lists.listIds, Order.String),
  };

  return useQuery({
    enabled: enabled && query.listIds.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const count = await callApi(
        (client) =>
          client.campaigns.countRecipients({
            params: { organizationId },
            query,
          }),
        signal
      );

      return count.recipients;
    },
    queryKey: [...campaignsKey(organizationId), "recipient-count", query],
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
