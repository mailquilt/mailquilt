import type {
  Campaign,
  CampaignDraft,
  CampaignId,
  CampaignNotDraft,
  CampaignNotFound,
  CampaignPage,
  ContactId,
  ListNotFound,
  NoSubscribedContacts,
  PostalAddressRequired,
  ProviderConnectionId,
  ProviderConnectionNotFound,
  SendFailureReason,
  Sender,
} from "@repo/domain";
import {
  postalAddressLine,
  SendFailed,
  withFooterHtml,
  withFooterText,
} from "@repo/domain";
import { Array as Arr, Context, Effect, Option, pipe, Ref } from "effect";
import type { Types } from "effect";

import { CurrentOrganization } from "./current-organization.ts";
import { plainTextOf } from "./plain-text.ts";
import { preferencesUrl } from "./preferences-link.ts";
import { ProviderConnections } from "./provider-connections.ts";
import { sendThrough } from "./provider.ts";
import type { OutgoingEmail, SentEmail, SmtpProvider } from "./provider.ts";
import { asQueuedFor, Queue } from "./queue.ts";
import type { QueueMessage } from "./queue.ts";
import { SendCampaignBatch } from "./send-campaign-batch.ts";
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
    /** Creates a draft. Fails if the Organization doesn't have its List or Provider Connection. */
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
     * Moves a draft to `sending` and, in the same transaction, fixes who it
     * goes to: every Contact with a subscribed Subscription to its List, in
     * one query, split into batches of `batchSize`. `enqueue` is given the
     * number of batches and runs inside that transaction, so if it fails
     * nothing changes. Fails, changing nothing, if the Campaign isn't a
     * draft, has no Provider Connection, its Organization has no postal
     * address, or there's no one to send it to. An address can be changed
     * but never removed, so it's still there when the batches go out.
     */
    readonly startSending: (
      id: CampaignId,
      batchSize: number,
      enqueue: (batches: number) => Effect.Effect<void>
    ) => Effect.Effect<
      Campaign,
      | CampaignNotFound
      | CampaignNotDraft
      | ProviderConnectionNotFound
      | PostalAddressRequired
      | NoSubscribedContacts,
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
    /** Whether the Contact is still subscribed to the Campaign's List and has no Opt-out. */
    readonly stillConsents: (
      id: CampaignId,
      contactId: ContactId
    ) => Effect.Effect<boolean, never, CurrentOrganization>;
    /**
     * Records what the Provider did for each recipient still queued, adds
     * them to the Campaign's counts and writes a `sent` delivery event for
     * each email it accepted, in one statement. Then, in a statement of its
     * own, marks the Campaign `sent` once none of its recipients are still
     * queued; with no outcomes, only that runs.
     */
    readonly recordOutcomes: (
      id: CampaignId,
      outcomes: readonly RecipientOutcome[]
    ) => Effect.Effect<void, never, CurrentOrganization>;
  }
>()("@repo/core/Campaigns") {}

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
      queue.enqueue(
        Arr.makeBy(
          batches,
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
    "They unsubscribed or stopped marketing email before it was sent to them.",
  reason: "failed",
});

const NO_CONNECTION = new SendFailed({
  detail: "The Campaign's provider connection was deleted.",
  reason: "failed",
});

const sendCampaignBatch = (message: SendCampaignBatch) =>
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

    if (found.value.recipients.length === 0) {
      return yield* campaigns.recordOutcomes(message.campaignId, []);
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

        const sent: Effect.Effect<SentEmail, SendFailed, SmtpProvider> =
          Option.match(connection, {
            onNone: () => Effect.fail(NO_CONNECTION),
            onSome: (opened) => sendThrough(opened, email),
          });

        return yield* sent;
      });

    const serverFailure = yield* Ref.make(Option.none<SendFailed>());

    const sendUnlessServerFailed = (recipient: QueuedRecipient) =>
      Effect.flatMap(Ref.get(serverFailure), (earlier) =>
        Option.match(earlier, {
          onNone: () =>
            sendTo(recipient).pipe(
              Effect.tapError((failed) =>
                SERVER_FAILURES.has(failed.reason)
                  ? Ref.set(serverFailure, Option.some(failed))
                  : Effect.void
              )
            ),
          onSome: Effect.fail,
        })
      );

    // WARNING: a batch can take minutes to send, so consent is read again just before each email, not once per batch; otherwise someone who unsubscribes or opts out partway through still gets it.
    const sendOrSkip = (recipient: QueuedRecipient) =>
      Effect.flatMap(
        campaigns.stillConsents(message.campaignId, recipient.contactId),
        (consents) =>
          consents
            ? sendUnlessServerFailed(recipient)
            : Effect.fail(NO_LONGER_CONSENTS)
      );

    const outcomeFor = (recipient: QueuedRecipient) =>
      sendOrSkip(recipient).pipe(
        Effect.match({
          onFailure: (failed) =>
            ({
              contactId: recipient.contactId,
              failed,
            }) satisfies RecipientOutcome,
          onSuccess: (sent) =>
            ({
              contactId: recipient.contactId,
              sent,
            }) satisfies RecipientOutcome,
        })
      );

    const outcomes = yield* pipe(batch.recipients, Effect.forEach(outcomeFor));

    yield* campaigns.recordOutcomes(message.campaignId, outcomes);
  }).pipe(asQueuedFor(message));

/**
 * Does the work one queue message asks for. For a Campaign batch: sends to
 * the recipients in it that are still queued, one email each, through the
 * Campaign's Provider Connection, and records what happened to each. A
 * Provider refusing one recipient doesn't stop the others; once its server
 * can't be reached or refuses the connection, the rest of the batch is
 * recorded with that failure without trying them. A batch delivered again
 * sends only to those still queued.
 */
export const handleQueueMessage = (message: QueueMessage) =>
  sendCampaignBatch(message);
