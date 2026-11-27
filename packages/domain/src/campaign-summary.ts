import { Schema } from "effect";

import {
  CampaignListIds,
  CampaignStatusSchema,
  CampaignSubject,
  ExcludedListIds,
} from "./campaign-content.ts";
import { CampaignSchedule } from "./campaign-schedule.ts";
import { Count } from "./count.ts";
import { CampaignIdSchema, ProviderConnectionIdSchema } from "./ids.ts";
import { MailAddress, Sender } from "./provider-connection.ts";

/**
 * A Campaign without its HTML, as a page of Campaigns lists it. `listIds`
 * are the Lists it goes to and `excludedListIds` those it leaves out, each
 * in ID order.
 * `providerConnectionId` is null once that Provider Connection is deleted.
 * `recipients` are the Contacts it goes to, fixed when it starts sending: how
 * many, and how many of them the Provider accepted it for, or refused it for,
 * so far. `schedule` is when it's scheduled to start sending, or was
 * (see `CampaignSchedule`), and null if it never was or its schedule was
 * cancelled. `sendingStartedAt` is when it started sending, and `sentAt`
 * when the last of them was done.
 */
export class CampaignSummary extends Schema.Class<CampaignSummary>(
  "CampaignSummary"
)({
  id: CampaignIdSchema,
  subject: CampaignSubject,
  from: Sender,
  replyTo: Schema.NullOr(MailAddress),
  listIds: CampaignListIds,
  excludedListIds: ExcludedListIds,
  providerConnectionId: Schema.NullOr(ProviderConnectionIdSchema),
  status: CampaignStatusSchema,
  recipients: Schema.Struct({ total: Count, sent: Count, failed: Count }),
  schedule: Schema.NullOr(CampaignSchedule),
  createdAt: Schema.DateTimeUtc,
  sendingStartedAt: Schema.NullOr(Schema.DateTimeUtc),
  sentAt: Schema.NullOr(Schema.DateTimeUtc),
}) {}
