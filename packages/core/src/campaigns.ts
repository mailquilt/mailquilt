import type {
  Campaign,
  CampaignDraft,
  CampaignLists,
  CampaignId,
  CampaignNotDraft,
  CampaignNotFound,
  CampaignNotSending,
  CampaignPage,
  ContactId,
  ListNotFound,
  MissedScheduleReason,
  NoSubscribedContacts,
  OrganizationId,
  PostalAddressRequired,
  ProviderConnectionId,
  ProviderConnectionNotFound,
  ScheduleRequest,
  SendFailureReason,
  Sender,
} from "@repo/domain";
import {
  postalAddressLine,
  ScheduleInPast,
  scheduledInstant,
  SendFailed,
  withFooterHtml,
  withFooterText,
} from "@repo/domain";
import {
  Array as Arr,
  Context,
  DateTime,
  Duration,
  Effect,
  Option,
  Ref,
} from "effect";
import type { Types } from "effect";

import { BatchDeferred } from "./batch-deferred.ts";
import { BatchStillSending } from "./batch-still-sending.ts";
import { CurrentOrganization } from "./current-organization.ts";
import { plainTextOf } from "./plain-text.ts";
import { preferencesUrl } from "./preferences-link.ts";
import { ProviderConnections } from "./provider-connections.ts";
import type { OutgoingEmail, SentEmail } from "./provider-port.ts";
import { sendingRateOf, sendThrough } from "./provider.ts";
import { asQueuedFor, Queue, QUEUE_RETRIES } from "./queue.ts";
import type { QueueMessage } from "./queue.ts";
import { Scheduler } from "./scheduler.ts";
import { SendCampaignBatch } from "./send-campaign-batch.ts";
import type { SendDeferred } from "./send-deferred.ts";
import type { SesProvider } from "./ses-provider.ts";
import type { SmtpProvider } from "./smtp-provider.ts";
import { StartScheduledCampaign } from "./start-scheduled-campaign.ts";
import { unsubscribeHeaders, unsubscribeUrl } from "./unsubscribe.ts";

/** How many of a Campaign's recipients one queue message sends to. */
export const SEND_BATCH_SIZE = 100;

/** Which page of Campaigns to list (ADR 0008). */
export interface CampaignFilter {
  readonly after?: CampaignId;
  readonly before?: CampaignId;
}

/** A Contact a Campaign is still to be sent to, at the address they had when it started sending. */
export interface QueuedRecipient {
  readonly contactId: ContactId;
  readonly email: string;
}

/** What one queue message sends: the Campaign's content, and its recipients in that batch still queued. */
export interface CampaignBatch {
  readonly subject: string;
  readonly from: typeof Sender.Type;
  readonly replyTo: string | null;
  readonly html: string;
  readonly organizationName: string;
  /** `null` only for a Campaign that started sending before Organizations had one. */
  readonly postalAddress: string | null;
  readonly providerConnectionId: ProviderConnectionId | null;
  readonly recipients: readonly QueuedRecipient[];
}

/** Whether a delivery of a batch claimed a recipient, and whether they still consent (see `Campaigns.claim`). */
export type RecipientClaim = "consents" | "left" | "stopped" | "taken";

/** What the Provider did with the Campaign for one recipient. */
export type RecipientOutcome =
  | {
      readonly contactId: ContactId;
      readonly sent: { readonly messageId: string };
    }
  | { readonly contactId: ContactId; readonly failed: SendFailed };

/** Port: the Campaigns of the Organization the work acts in. */
export class Campaigns extends Context.Service<
  Campaigns,
  {
    /**
     * How many Contacts a Campaign to `lists` would be sent to now, worked
     * out the same way `startSending` fixes them. Fails if the Organization
     * doesn't have one of the Lists.
     */
    readonly countRecipients: (
      lists: typeof CampaignLists.Type
    ) => Effect.Effect<number, ListNotFound, CurrentOrganization>;
    /** Creates a draft. Fails if the Organization doesn't have its Lists or Provider Connection. */
    readonly create: (
      draft: typeof CampaignDraft.Type
    ) => Effect.Effect<
      Campaign,
      ListNotFound | ProviderConnectionNotFound,
      CurrentOrganization
    >;
    /** Replaces a draft's content. A Campaign that started sending can't change. */
    readonly update: (
      id: CampaignId,
      draft: typeof CampaignDraft.Type
    ) => Effect.Effect<
      Campaign,
      | CampaignNotFound
      | CampaignNotDraft
      | ListNotFound
      | ProviderConnectionNotFound,
      CurrentOrganization
    >;
    readonly get: (
      id: CampaignId
    ) => Effect.Effect<Campaign, CampaignNotFound, CurrentOrganization>;
    /** One page of Campaigns, newest first. */
    readonly page: (
      filter: CampaignFilter
    ) => Effect.Effect<CampaignPage, never, CurrentOrganization>;
    /**
     * Moves a draft to `sending`, or with `scheduledAt`, a Campaign
     * scheduled for that instant, and in the same transaction fixes who it
     * goes to: every Contact with a subscribed Subscription to any of its
     * Lists, none to a List it leaves out, no Opt-out and an address that
     * isn't Suppressed, once each, in one query, split into batches of
     * `batchSize`. `enqueue` is given the
     * number of batches and runs inside that transaction, so if it fails
     * nothing changes. Fails, changing nothing, if the Campaign isn't a
     * draft (or isn't scheduled for `scheduledAt`), has no Provider
     * Connection, its Organization has no postal address, or there's no one
     * to send it to. An address can be changed but never removed, so it's
     * still there when the batches go out. A draft sent now loses any
     * schedule it missed.
     */
    readonly startSending: (
      id: CampaignId,
      batchSize: number,
      enqueue: (batches: number) => Effect.Effect<void>,
      scheduledAt?: DateTime.Utc
    ) => Effect.Effect<
      Campaign,
      | CampaignNotFound
      | CampaignNotDraft
      | ProviderConnectionNotFound
      | PostalAddressRequired
      | NoSubscribedContacts,
      CurrentOrganization
    >;
    /**
     * Makes a draft, or a scheduled Campaign, `scheduled` for `at` in
     * `timeZone`, after the checks `startSending` makes, in one transaction
     * that `schedule` joins, so if it fails nothing changes.
     */
    readonly schedule: (
      id: CampaignId,
      at: DateTime.Utc,
      timeZone: string,
      schedule: Effect.Effect<void>
    ) => Effect.Effect<
      Campaign,
      | CampaignNotFound
      | CampaignNotDraft
      | ProviderConnectionNotFound
      | PostalAddressRequired
      | NoSubscribedContacts,
      CurrentOrganization
    >;
    /** Makes a draft or scheduled Campaign a draft with no schedule. */
    readonly cancelSchedule: (
      id: CampaignId
    ) => Effect.Effect<
      Campaign,
      CampaignNotFound | CampaignNotDraft,
      CurrentOrganization
    >;
    /**
     * Makes a Campaign still scheduled for `at` a draft again, keeping its
     * schedule with why it was missed. Anything else is left as it is.
     */
    readonly missSchedule: (
      id: CampaignId,
      at: DateTime.Utc,
      reason: MissedScheduleReason
    ) => Effect.Effect<void, never, CurrentOrganization>;
    /** Makes a sending Campaign `paused`; one already paused stays so. */
    readonly pause: (
      id: CampaignId
    ) => Effect.Effect<
      Campaign,
      CampaignNotFound | CampaignNotSending,
      CurrentOrganization
    >;
    /**
     * Makes a paused Campaign `sending` again, and in the same transaction
     * gives `enqueue` every batch with a recipient still queued or claimed,
     * so if it fails nothing changes; with none, the Campaign is `sent`. One
     * already sending stays so, and nothing is queued.
     */
    readonly resume: (
      id: CampaignId,
      enqueue: (batches: readonly number[]) => Effect.Effect<void>
    ) => Effect.Effect<
      Campaign,
      CampaignNotFound | CampaignNotSending,
      CurrentOrganization
    >;
    /** Makes a sending or paused Campaign `cancelled`; one already cancelled stays so. */
    readonly cancel: (
      id: CampaignId
    ) => Effect.Effect<
      Campaign,
      CampaignNotFound | CampaignNotSending,
      CurrentOrganization
    >;
    /** The Campaign's content and the recipients in `batch` still queued, or none if it doesn't exist. */
    readonly queuedBatch: (
      id: CampaignId,
      batch: number
    ) => Effect.Effect<
      Option.Option<CampaignBatch>,
      never,
      CurrentOrganization
    >;
    /**
     * Claims a recipient still queued for one delivery of its batch, at `at`,
     * so no other delivery sends to them: `"stopped"` if the Campaign isn't
     * sending, because it was paused or cancelled, and `"taken"` if they
     * aren't queued, because another delivery claimed them or they were
     * already recorded.
     * A claimed recipient `"consents"` while they're still subscribed to one
     * of the Lists the Campaign goes to, have no Opt-out and their address
     * isn't Suppressed, and has `"left"` otherwise. The Lists it leaves out
     * were applied when it started sending.
     */
    readonly claim: (
      id: CampaignId,
      contactId: ContactId,
      at: DateTime.Utc
    ) => Effect.Effect<RecipientClaim, never, CurrentOrganization>;
    /**
     * Records what happened to a recipient this delivery claimed, adds it to
     * the Campaign's counts and, for an email the Provider accepted, writes a
     * `sent` delivery event, in one statement.
     */
    readonly recordOutcome: (
      id: CampaignId,
      outcome: RecipientOutcome
    ) => Effect.Effect<void, never, CurrentOrganization>;
    /**
     * Puts a recipient this delivery claimed back in the queue, for the
     * batch's next delivery to try.
     */
    readonly putBack: (
      id: CampaignId,
      contactId: ContactId
    ) => Effect.Effect<void, never, CurrentOrganization>;
    /**
     * Once a delivery of `batch` has tried everyone it could claim: records
     * as `cutOff` every recipient in it claimed before `claimedBefore` and
     * never recorded, whose delivery must have stopped, then, in a statement
     * of its own, marks the Campaign, sending or paused, `sent` once none of
     * its recipients are queued or claimed. Says whether any in the batch are
     * still unsettled: claimed by a delivery that may still be sending to
     * them, or queued, such as put back by another delivery after this one
     * read the batch.
     */
    readonly settleBatch: (
      id: CampaignId,
      batch: number,
      claimedBefore: DateTime.Utc,
      cutOff: SendFailed
    ) => Effect.Effect<
      { readonly unsettled: boolean },
      never,
      CurrentOrganization
    >;
  }
>()("@repo/core/Campaigns") {}

/** How many Contacts a Campaign to `lists` would be sent to now. */
export const countRecipients = (lists: typeof CampaignLists.Type) =>
  Effect.gen(function* countCampaignRecipients() {
    const campaigns = yield* Campaigns;

    return { recipients: yield* campaigns.countRecipients(lists) };
  });

/** Creates a draft Campaign in the Organization this request acts in. */
export const createCampaign = (draft: typeof CampaignDraft.Type) =>
  Effect.gen(function* createOrganizationCampaign() {
    const campaigns = yield* Campaigns;

    return yield* campaigns.create(draft);
  });

/** Replaces a draft Campaign's content. */
export const updateCampaign = (
  id: CampaignId,
  draft: typeof CampaignDraft.Type
) =>
  Effect.gen(function* updateOrganizationCampaign() {
    const campaigns = yield* Campaigns;

    return yield* campaigns.update(id, draft);
  });

/** One Campaign in the Organization. */
export const getCampaign = (id: CampaignId) =>
  Effect.gen(function* getOrganizationCampaign() {
    const campaigns = yield* Campaigns;

    return yield* campaigns.get(id);
  });

/** One page of the Organization's Campaigns, newest first. */
export const listCampaigns = (filter: CampaignFilter) =>
  Effect.gen(function* listOrganizationCampaigns() {
    const campaigns = yield* Campaigns;

    return yield* campaigns.page(filter);
  });

const batchMessages = (
  organizationId: OrganizationId,
  campaignId: CampaignId,
  batches: number
) =>
  Arr.makeBy(
    batches,
    (batch) => new SendCampaignBatch({ batch, campaignId, organizationId })
  );

/**
 * Schedules a draft, or a scheduled Campaign, to start sending at the
 * date and time a member chose in a time zone, refusing one that has
 * passed. It's checked as sending it now would be, so a member learns now
 * what would stop it.
 */
export const scheduleCampaign = (
  id: CampaignId,
  request: typeof ScheduleRequest.Type
) =>
  Effect.gen(function* scheduleOrganizationCampaign() {
    const campaigns = yield* Campaigns;
    const scheduler = yield* Scheduler;
    const organization = yield* CurrentOrganization;
    const now = yield* DateTime.now;

    const at = yield* scheduledInstant(request).pipe(
      Effect.fromOption,
      Effect.orDie
    );

    if (!DateTime.isGreaterThan(at, now)) {
      return yield* new ScheduleInPast();
    }

    return yield* campaigns.schedule(
      id,
      at,
      request.timeZone,
      scheduler.schedule(
        new StartScheduledCampaign({
          at,
          campaignId: id,
          organizationId: organization.id,
        }),
        at
      )
    );
  });

/**
 * Sends a draft Campaign now: fixes who it goes to and queues one message
 * per batch of them, so the request answers at once and the emails go out
 * in the background.
 */
export const sendCampaign = (id: CampaignId) =>
  Effect.gen(function* sendOrganizationCampaign() {
    const campaigns = yield* Campaigns;
    const queue = yield* Queue;
    const organization = yield* CurrentOrganization;

    return yield* campaigns.startSending(id, SEND_BATCH_SIZE, (batches) =>
      queue.enqueue(batchMessages(organization.id, id, batches))
    );
  });

/** Makes a scheduled Campaign a draft again. */
export const cancelCampaignSchedule = (id: CampaignId) =>
  Effect.gen(function* cancelOrganizationCampaignSchedule() {
    const campaigns = yield* Campaigns;

    return yield* campaigns.cancelSchedule(id);
  });

/** Holds a sending Campaign's emails not yet sent, until it's resumed. */
export const pauseCampaign = (id: CampaignId) =>
  Effect.gen(function* pauseOrganizationCampaign() {
    const campaigns = yield* Campaigns;

    return yield* campaigns.pause(id);
  });

/** Sends a paused Campaign's emails not yet sent, queuing again each batch that has any. */
export const resumeCampaign = (id: CampaignId) =>
  Effect.gen(function* resumeOrganizationCampaign() {
    const campaigns = yield* Campaigns;
    const queue = yield* Queue;
    const organization = yield* CurrentOrganization;

    return yield* campaigns.resume(id, (batches) =>
      queue.enqueue(
        batches.map(
          (batch) =>
            new SendCampaignBatch({
              batch,
              campaignId: id,
              organizationId: organization.id,
            })
        )
      )
    );
  });

/** Stops a sending or paused Campaign for good: the emails it hadn't sent never are. */
export const cancelCampaign = (id: CampaignId) =>
  Effect.gen(function* cancelOrganizationCampaign() {
    const campaigns = yield* Campaigns;

    return yield* campaigns.cancel(id);
  });

const startScheduledCampaign = (message: StartScheduledCampaign) =>
  Effect.gen(function* startScheduled() {
    const campaigns = yield* Campaigns;
    const queue = yield* Queue;

    const missed = (reason: MissedScheduleReason) => () =>
      campaigns.missSchedule(message.campaignId, message.at, reason);

    yield* campaigns
      .startSending(
        message.campaignId,
        SEND_BATCH_SIZE,
        (batches) =>
          queue.enqueue(
            batchMessages(message.organizationId, message.campaignId, batches)
          ),
        message.at
      )
      .pipe(
        Effect.asVoid,
        Effect.catchTags({
          CampaignNotDraft: () => Effect.void,
          CampaignNotFound: () => Effect.void,
          NoSubscribedContacts: missed("no-subscribed-contacts"),
          ProviderConnectionNotFound: missed("no-provider-connection"),
        }),
        // WARNING: scheduling needs a postal address, and one can't be removed, so its absence now is a defect.
        Effect.orDie
      );
  }).pipe(asQueuedFor(message));

const SERVER_FAILURES = new Set<SendFailureReason>([
  "auth",
  "blocked",
  "host-not-found",
  "tls",
  "unavailable",
  "unreachable",
]);

const NO_LONGER_CONSENTS = new SendFailed({
  detail:
    "They unsubscribed, stopped marketing email or were suppressed before it was sent to them.",
  reason: "failed",
});

const NO_CONNECTION = new SendFailed({
  detail: "The Campaign's provider connection was deleted.",
  reason: "failed",
});

const MINUTE_MS = 60_000;

// WARNING: a claim older than this is taken to be a delivery that stopped, and its recipient is recorded as failed, so it must outlast any one email's send (60 seconds over SMTP) and the write after it; one that expires too soon only mislabels a recipient, never sends twice.
const CLAIM_EXPIRES_AFTER = Duration.minutes(2);

const CUT_OFF = new SendFailed({
  detail:
    "Sending to them was cut off, so it may or may not have reached them. It isn't sent again, so no one gets it twice.",
  reason: "failed",
});

const sendCampaignBatch = (message: SendCampaignBatch, attempt: number) =>
  Effect.gen(function* sendBatch() {
    const campaigns = yield* Campaigns;
    const connections = yield* ProviderConnections;

    const found = yield* campaigns.queuedBatch(
      message.campaignId,
      message.batch
    );

    if (Option.isNone(found)) {
      return;
    }

    const settle = Effect.gen(function* settleBatch() {
      const now = yield* DateTime.now;

      const { unsettled } = yield* campaigns.settleBatch(
        message.campaignId,
        message.batch,
        DateTime.subtractDuration(now, CLAIM_EXPIRES_AFTER),
        CUT_OFF
      );

      return unsettled;
    });

    if (found.value.recipients.length === 0) {
      if (yield* settle) {
        return yield* new BatchStillSending();
      }

      return;
    }

    const batch = found.value;
    const text = plainTextOf(batch.html);

    const addressLine =
      batch.postalAddress === null
        ? null
        : postalAddressLine(batch.organizationName, batch.postalAddress);

    const connection =
      batch.providerConnectionId === null
        ? Option.none()
        : yield* connections
            .withCredentials(batch.providerConnectionId)
            .pipe(Effect.option);

    const rate = Option.isSome(connection)
      ? yield* sendingRateOf(connection.value)
      : Option.none<number>();

    const interval = rate.pipe(
      Option.map((perMinute) => Duration.millis(MINUTE_MS / perMinute))
    );

    // WARNING: the slot is taken before the recipient is claimed, so however long the wait, the claim is never old enough for another delivery to take it as cut off.
    const waitForSendSlot = Effect.gen(function* waitForSendSlot() {
      if (Option.isNone(interval) || batch.providerConnectionId === null) {
        return;
      }

      const now = yield* DateTime.now;

      const slot = yield* connections.takeSendSlot(
        batch.providerConnectionId,
        interval.value,
        now
      );

      const reserved = yield* DateTime.now;

      if (Option.isSome(slot) && DateTime.isGreaterThan(slot.value, reserved)) {
        yield* Effect.sleep(DateTime.distance(reserved, slot.value));
      }
    });

    const sendTo = (recipient: QueuedRecipient) =>
      Effect.gen(function* sendToRecipient() {
        const unsubscribe = yield* unsubscribeUrl({
          campaignId: message.campaignId,
          contactId: recipient.contactId,
          organizationId: message.organizationId,
        });

        const preferences = yield* preferencesUrl({
          contactId: recipient.contactId,
          organizationId: message.organizationId,
        });

        const footer = {
          addressLine,
          preferencesUrl: preferences,
          unsubscribeUrl: unsubscribe,
        };

        const email: Types.Mutable<OutgoingEmail> = {
          from: batch.from,
          headers: unsubscribeHeaders(unsubscribe),
          html: withFooterHtml(batch.html, footer),
          subject: batch.subject,
          text: withFooterText(text, footer),
          to: recipient.email,
        };

        if (batch.replyTo !== null) {
          email.replyTo = batch.replyTo;
        }

        const sent: Effect.Effect<
          SentEmail,
          SendFailed | SendDeferred,
          SmtpProvider | SesProvider
        > = Option.match(connection, {
          onNone: () => Effect.fail(NO_CONNECTION),
          onSome: (opened) => sendThrough(opened, email),
        });

        return yield* sent;
      });

    // WARNING: the queue drops a batch after its last delivery, so an email put off then would never be sent or recorded, and the Campaign would never finish; it's recorded failed instead.
    const lastDelivery = attempt > QUEUE_RETRIES;
    const serverFailure = yield* Ref.make(Option.none<SendFailed>());
    const serverPutOff = yield* Ref.make(false);
    const anyPutOff = yield* Ref.make(false);
    const stopped = yield* Ref.make(false);

    const sendUnlessServerFailed = (recipient: QueuedRecipient) =>
      Effect.flatMap(Ref.get(serverFailure), (earlier) =>
        Option.match(earlier, {
          onNone: () =>
            sendTo(recipient).pipe(
              Effect.catchTag("SendDeferred", (deferred) =>
                Effect.gen(function* putOffOrFail() {
                  if (!lastDelivery) {
                    return yield* deferred;
                  }

                  if (deferred.everyEmail) {
                    yield* Ref.set(serverFailure, Option.some(deferred.failed));
                  }

                  return yield* deferred.failed;
                })
              ),
              Effect.tapError((notSent) => {
                const failed =
                  notSent._tag === "SendDeferred" ? notSent.failed : notSent;

                if (notSent._tag === "SendDeferred" && notSent.everyEmail) {
                  return Ref.set(serverPutOff, true);
                }

                if (!SERVER_FAILURES.has(failed.reason)) {
                  return Effect.void;
                }

                return notSent._tag === "SendDeferred"
                  ? Ref.set(serverPutOff, true)
                  : Ref.set(serverFailure, Option.some(failed));
              })
            ),
          onSome: Effect.fail,
        })
      );

    const recordFor = (recipient: QueuedRecipient, sent: SentEmail) =>
      campaigns.recordOutcome(message.campaignId, {
        contactId: recipient.contactId,
        sent,
      });

    const failFor = (recipient: QueuedRecipient, failed: SendFailed) =>
      campaigns.recordOutcome(message.campaignId, {
        contactId: recipient.contactId,
        failed,
      });

    const putOff = (recipient: QueuedRecipient) =>
      campaigns
        .putBack(message.campaignId, recipient.contactId)
        .pipe(Effect.andThen(Ref.set(anyPutOff, true)));

    // WARNING: a batch can take minutes to send, so consent is read again just before each email, not once per batch; otherwise someone who unsubscribes, opts out or is Suppressed partway through still gets it. Each outcome is recorded as soon as it's known, so a delivery cut off later never sends it again.
    const sendOnce = (recipient: QueuedRecipient) =>
      Effect.gen(function* sendOnceTo() {
        if ((yield* Ref.get(serverPutOff)) || (yield* Ref.get(stopped))) {
          return;
        }

        if (Option.isNone(yield* Ref.get(serverFailure))) {
          yield* waitForSendSlot;
        }

        const claim = yield* campaigns.claim(
          message.campaignId,
          recipient.contactId,
          yield* DateTime.now
        );

        if (claim === "stopped") {
          return yield* Ref.set(stopped, true);
        }

        if (claim === "taken") {
          return;
        }

        if (claim === "left") {
          return yield* failFor(recipient, NO_LONGER_CONSENTS);
        }

        yield* sendUnlessServerFailed(recipient).pipe(
          Effect.matchEffect({
            onFailure: (error) =>
              error._tag === "SendDeferred"
                ? putOff(recipient)
                : failFor(recipient, error),
            onSuccess: (sent) => recordFor(recipient, sent),
          })
        );
      });

    yield* Effect.forEach(batch.recipients, sendOnce, { discard: true });

    const unsettled = yield* settle;

    // WARNING: a paused or cancelled Campaign's batch is done for now; resuming queues again every batch with anyone left, so asking the queue to deliver it again would only spend its retries.
    if (yield* Ref.get(stopped)) {
      return;
    }

    if (yield* Ref.get(anyPutOff)) {
      return yield* new BatchDeferred();
    }

    if (unsettled) {
      return yield* new BatchStillSending();
    }
  }).pipe(asQueuedFor(message));

/**
 * Does the work one queue message asks for. For a Campaign batch: sends to
 * the recipients in it that are still queued, one email each, through the
 * Campaign's Provider Connection, and records what happened to each, until
 * the Campaign is paused or cancelled. A
 * Provider refusing one recipient doesn't stop the others; once its server
 * can't be reached or refuses the connection, the rest of the batch is
 * recorded with that failure without trying them. Each recipient is claimed
 * before their email and recorded right after it, so however often a batch
 * is delivered, no one is sent it twice (ADR 0014); a delivery that finds
 * someone claimed by another that may still be sending fails with
 * `BatchStillSending`, to be delivered again. An email the Provider puts off
 * goes back in the queue, and the delivery fails with `BatchDeferred`, to
 * be delivered again, except on the queue's last delivery of the batch
 * (`attempt`, counting from 1, is more than `QUEUE_RETRIES`), where it's
 * recorded failed. For a scheduled Campaign that's due:
 * starts sending it if it's still scheduled for that time, as sending it
 * now would; if it can't, it becomes a draft again, saying why.
 */
export const handleQueueMessage = (message: QueueMessage, attempt: number) =>
  Effect.gen(function* handleMessage() {
    if (message._tag === "SendCampaignBatch") {
      return yield* sendCampaignBatch(message, attempt);
    }

    return yield* startScheduledCampaign(message);
  });
