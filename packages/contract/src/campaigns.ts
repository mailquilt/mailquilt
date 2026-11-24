import {
  Campaign,
  CampaignDraft,
  CampaignIdSchema,
  CampaignNotDraft,
  CampaignNotFound,
  CampaignPage,
  ListNotFound,
  NoSubscribedContacts,
  OrganizationIdSchema,
  ProviderConnectionNotFound,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { OrganizationNotFoundError, SignInRequiredError } from "./errors.ts";

const params = { organizationId: OrganizationIdSchema };

const campaignParams = { ...params, campaignId: CampaignIdSchema };

const CampaignNotFoundError = CampaignNotFound.pipe(HttpApiSchema.status(404));

const CampaignNotDraftError = CampaignNotDraft.pipe(HttpApiSchema.status(409));

const ListNotFoundError = ListNotFound.pipe(HttpApiSchema.status(404));

const ProviderConnectionNotFoundError = ProviderConnectionNotFound.pipe(
  HttpApiSchema.status(404)
);

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
      params,
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
      params,
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
          NoSubscribedContacts.pipe(HttpApiSchema.status(409)),
        ],
        params: campaignParams,
        success: Campaign,
      }
    )
  ) {}
