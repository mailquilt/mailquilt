import {
  Campaign,
  CampaignDraft,
  CampaignIdSchema,
  CampaignPage,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import {
  CampaignNotDraftError,
  CampaignNotFoundError,
  ListNotFoundError,
  NoSubscribedContactsError,
  PostalAddressRequiredError,
  OrganizationNotFoundError,
  ProviderConnectionNotFoundError,
  SignInRequiredError,
} from "./errors.ts";
import { organizationParams } from "./params.ts";

const campaignParams = { ...organizationParams, campaignId: CampaignIdSchema };

/** Which page of Campaigns to list: the `next` or `previous` cursor of another page (ADR 0008). */
export const CampaignQuery = Schema.Struct({
  after: Schema.optionalKey(CampaignIdSchema),
  before: Schema.optionalKey(CampaignIdSchema),
}).check(
  Schema.makeFilter(
    (query) => query.after === undefined || query.before === undefined,
    { message: "Ask for the page after one cursor or before it, not both." }
  )
);

/**
 * An Organization's Campaigns. A Campaign is a draft until `send`, which
 * fixes who it goes to (every Contact with a subscribed Subscription to its
 * List) and sends it in the background: it answers with the Campaign
 * `sending`, which becomes `sent` once every one of them was sent it or the
 * Provider refused it. A draft can be changed; a Campaign that started
 * sending can't be changed or sent again (`CampaignNotDraft`). `send` fails
 * with `NoSubscribedContacts` when there's no one to send it to, and with
 * `ProviderConnectionNotFound` when its Provider Connection was deleted.
 */
export class CampaignsApi extends HttpApiGroup.make("campaigns")
  .add(
    HttpApiEndpoint.get("list", "/organizations/:organizationId/campaigns", {
      error: [SignInRequiredError, OrganizationNotFoundError],
      params: organizationParams,
      query: CampaignQuery,
      success: CampaignPage,
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/organizations/:organizationId/campaigns", {
      error: [
        SignInRequiredError,
        OrganizationNotFoundError,
        ListNotFoundError,
        ProviderConnectionNotFoundError,
      ],
      params: organizationParams,
      payload: CampaignDraft,
      success: Campaign.pipe(HttpApiSchema.status(201)),
    })
  )
  .add(
    HttpApiEndpoint.get(
      "get",
      "/organizations/:organizationId/campaigns/:campaignId",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          CampaignNotFoundError,
        ],
        params: campaignParams,
        success: Campaign,
      }
    )
  )
  .add(
    HttpApiEndpoint.put(
      "update",
      "/organizations/:organizationId/campaigns/:campaignId",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          CampaignNotFoundError,
          CampaignNotDraftError,
          ListNotFoundError,
          ProviderConnectionNotFoundError,
        ],
        params: campaignParams,
        payload: CampaignDraft,
        success: Campaign,
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "send",
      "/organizations/:organizationId/campaigns/:campaignId/send",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          CampaignNotFoundError,
          CampaignNotDraftError,
          ProviderConnectionNotFoundError,
          NoSubscribedContactsError,
          PostalAddressRequiredError,
        ],
        params: campaignParams,
        success: Campaign,
      }
    )
  ) {}
