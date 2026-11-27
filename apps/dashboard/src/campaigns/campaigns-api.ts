import type {
  Campaign,
  CampaignDraft,
  CampaignId,
  ListId,
  OrganizationId,
  ScheduleRequest,
} from "@repo/domain";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Array as Arr, DateTime, Effect, Order } from "effect";

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

const SCHEDULED_POLL_MAX_MS = 60 * 60 * 1000;

// WARNING: a start can fail through every retry and leave the Campaign scheduled at a time that has passed (ADR 0017), so the quick asking stops after a while.
const SCHEDULED_START_GRACE_MS = 15 * 60 * 1000;

// WARNING: a timer can't wait longer than about 24 days, so a schedule further ahead is asked for again within the hour, and the wait shortens as its time comes.
// WARNING: a paused Campaign is asked for too: an email being handed to the Provider when it paused still finishes and can leave it sent, and another member can resume or cancel it.
const nextAsk = (campaign: Campaign | null | undefined) => {
  if (campaign?.status === "sending" || campaign?.status === "paused") {
    return SENDING_POLL_MS;
  }

  if (campaign?.status !== "scheduled" || campaign.schedule === null) {
    return false;
  }

  const untilDue = DateTime.toEpochMillis(campaign.schedule.at) - Date.now();

  if (untilDue < -SCHEDULED_START_GRACE_MS) {
    return SCHEDULED_POLL_MAX_MS;
  }

  return Math.min(Math.max(untilDue, SENDING_POLL_MS), SCHEDULED_POLL_MAX_MS);
};

/**
 * One Campaign, or `null` when the Organization has no such Campaign: a
 * definite answer, so it isn't retried as a failure would be. While it is
 * sending or paused, it is asked for again every couple of seconds.
 * While it is scheduled, it is asked for again at its time, and then every
 * couple of seconds until it has started, for a quarter of an hour.
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
    refetchInterval: (query) => nextAsk(query.state.data),
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

/** Schedules a draft, or moves a schedule. The API answers with it scheduled. */
export const useScheduleCampaign = (
  organizationId: OrganizationId,
  campaignId: CampaignId
) => {
  const keep = useKeepCampaign(organizationId);

  return useMutation({
    mutationFn: (request: typeof ScheduleRequest.Type) =>
      callApi((client) =>
        client.campaigns.schedule({
          params: { campaignId, organizationId },
          payload: request,
        })
      ),
    onSuccess: keep,
  });
};

/** Cancels a schedule. The API answers with the Campaign a draft again. */
export const useCancelSchedule = (
  organizationId: OrganizationId,
  campaignId: CampaignId
) => {
  const keep = useKeepCampaign(organizationId);

  return useMutation({
    mutationFn: () =>
      callApi((client) =>
        client.campaigns.cancelSchedule({
          params: { campaignId, organizationId },
        })
      ),
    onSuccess: keep,
  });
};

const useMoveSending = (
  organizationId: OrganizationId,
  campaignId: CampaignId,
  move: "pause" | "resume" | "cancel"
) => {
  const keep = useKeepCampaign(organizationId);

  return useMutation({
    mutationFn: () =>
      callApi((client) =>
        client.campaigns[move]({ params: { campaignId, organizationId } })
      ),
    onSuccess: keep,
  });
};

/** Holds a sending Campaign's emails not yet sent. The API answers with it paused. */
export const usePauseCampaign = (
  organizationId: OrganizationId,
  campaignId: CampaignId
) => useMoveSending(organizationId, campaignId, "pause");

/** Sends a paused Campaign's emails not yet sent. The API answers with it sending. */
export const useResumeCampaign = (
  organizationId: OrganizationId,
  campaignId: CampaignId
) => useMoveSending(organizationId, campaignId, "resume");

/** Stops a sending or paused Campaign for good. The API answers with it cancelled. */
export const useCancelCampaign = (
  organizationId: OrganizationId,
  campaignId: CampaignId
) => useMoveSending(organizationId, campaignId, "cancel");
