import {
  Campaign,
  CampaignDraft,
  CampaignIdSchema,
  CampaignLists,
  CampaignPage,
  Count,
  ScheduleRequest,
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
  ScheduleInPastError,
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

/** How many Contacts a Campaign to those Lists would be sent to now. */
export const RecipientCount = Schema.Struct({ recipients: Count });

/**
 * An Organization's Campaigns. A Campaign is a draft until `send`, which
 * fixes who it goes to (every Contact with a subscribed Subscription to any
 * of its Lists, once, except anyone on a List it leaves out, with an Opt-out
 * or a Suppressed address) and sends it in the background: it answers with
 * the Campaign
 * `sending`, which becomes `sent` once every one of them was sent it or the
 * Provider refused it. A draft can be changed; a Campaign that started
 * sending can't be changed or sent again (`CampaignNotDraft`). `send` fails
 * with `NoSubscribedContacts` when there's no one to send it to, and with
 * `ProviderConnectionNotFound` when its Provider Connection was deleted.
 * `countRecipients` counts who a Campaign to some Lists would go to now,
 * the same way `send` fixes them.
 *
 * `schedule` makes a draft `scheduled`, to start sending at a time still to
 * come (`ScheduleInPast`), or moves a scheduled one to another time. It's
 * refused for the same reasons as `send`, checked now, and checked again
 * when it's due: if it can't start then, it becomes a draft, and its
 * `schedule.missed` says why. A scheduled Campaign can't be changed or
 * sent. `cancelSchedule` makes it a draft again, with no schedule, which
 * also clears a draft's missed schedule; one that started sending can't be
 * stopped (`CampaignNotDraft`).
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
      "countRecipients",
      "/organizations/:organizationId/campaigns/recipient-count",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          ListNotFoundError,
        ],
        params: organizationParams,
        query: CampaignLists,
        success: RecipientCount,
      }
    )
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
  )
  .add(
    HttpApiEndpoint.put(
      "schedule",
      "/organizations/:organizationId/campaigns/:campaignId/schedule",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          CampaignNotFoundError,
          CampaignNotDraftError,
          ProviderConnectionNotFoundError,
          NoSubscribedContactsError,
          PostalAddressRequiredError,
          ScheduleInPastError,
        ],
        params: campaignParams,
        payload: ScheduleRequest,
        success: Campaign,
      }
    )
  )
  .add(
    HttpApiEndpoint.delete(
      "cancelSchedule",
      "/organizations/:organizationId/campaigns/:campaignId/schedule",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          CampaignNotFoundError,
          CampaignNotDraftError,
        ],
        params: campaignParams,
        success: Campaign,
      }
    )
  ) {}
