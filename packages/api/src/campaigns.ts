import { MailquiltApi } from "@repo/contract";
import {
  asMemberOf,
  cancelCampaignSchedule,
  countRecipients,
  createCampaign,
  getCampaign,
  listCampaigns,
  scheduleCampaign,
  sendCampaign,
  updateCampaign,
} from "@repo/core";
import { HttpApiBuilder } from "effect/http-api";

import { signedIn } from "./auth/signed-in.ts";

/** An Organization's Campaigns, for its members (ADR 0007). */
export const CampaignsHandlers = HttpApiBuilder.group(
  MailquiltApi,
  "campaigns",
  (handlers) =>
    handlers
      .handle("list", ({ params, query }) =>
        listCampaigns(query).pipe(asMemberOf(params.organizationId), signedIn)
      )
      .handle("create", ({ params, payload }) =>
        createCampaign(payload).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("countRecipients", ({ params, query }) =>
        countRecipients(query).pipe(asMemberOf(params.organizationId), signedIn)
      )
      .handle("get", ({ params }) =>
        getCampaign(params.campaignId).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("update", ({ params, payload }) =>
        updateCampaign(params.campaignId, payload).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("send", ({ params }) =>
        sendCampaign(params.campaignId).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("schedule", ({ params, payload }) =>
        scheduleCampaign(params.campaignId, payload).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("cancelSchedule", ({ params }) =>
        cancelCampaignSchedule(params.campaignId).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
);
