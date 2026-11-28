import type { RecipientOutcome } from "@repo/core";
import { Campaigns, currentOrganizationId } from "@repo/core";
import type {
  CampaignDraft,
  CampaignId,
  CampaignLists,
  OrganizationId,
  ProviderConnectionId,
} from "@repo/domain";
import {
  Campaign,
  CampaignNotDraft,
  CampaignNotFound,
  CampaignNotSending,
  CampaignPage,
  ContactIdSchema,
  newCampaignId,
  NoSubscribedContacts,
  PostalAddressRequired,
  ProviderConnectionIdSchema,
  ProviderConnectionNotFound,
} from "@repo/domain";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { newestFirstPage } from "./newest-first-page.ts";
import { requireLists } from "./require-lists.ts";
import {
  campaignLists,
  campaignRecipients,
  campaigns,
  organizations,
  providerConnections,
} from "./schema.ts";

const decodeCampaign = Schema.decodeUnknownEffect(Campaign);

const decodePage = Schema.decodeUnknownEffect(CampaignPage);

const decodeProvider = Schema.decodeUnknownEffect(
  Schema.Literals(["smtp", "ses", "cloudflare"])
);

const summaryColumns = {
  createdAt: campaigns.createdAt,
  failed: campaigns.recipientsFailed,
  fromEmail: campaigns.fromEmail,
  fromName: campaigns.fromName,
  excludedListIds: sql<
    string[]
  >`array(select list_id from ${campaignLists} where campaign_id = ${campaigns.id} and excluded order by list_id)`,
  id: campaigns.id,
  listIds: sql<
    string[]
  >`array(select list_id from ${campaignLists} where campaign_id = ${campaigns.id} and not excluded order by list_id)`,
  providerConnectionId: campaigns.providerConnectionId,
  replyTo: campaigns.replyTo,
  scheduledAt: campaigns.scheduledAt,
  scheduleMissed: campaigns.scheduleMissed,
  scheduleTimeZone: campaigns.scheduleTimeZone,
  sendingStartedAt: campaigns.sendingStartedAt,
  sent: campaigns.recipientsSent,
  sentAt: campaigns.sentAt,
  status: campaigns.status,
  subject: campaigns.subject,
  total: campaigns.recipientsTotal,
};

const campaignColumns = { ...summaryColumns, html: campaigns.html };

interface SummaryRow {
  readonly id: string;
  readonly subject: string;
  readonly fromName: string | null;
  readonly fromEmail: string;
  readonly replyTo: string | null;
  readonly listIds: readonly string[];
  readonly excludedListIds: readonly string[];
  readonly providerConnectionId: string | null;
  readonly status: string;
  readonly total: number;
  readonly sent: number;
  readonly failed: number;
  readonly createdAt: Date;
  readonly scheduledAt: Date | null;
  readonly scheduleTimeZone: string | null;
  readonly scheduleMissed: string | null;
  readonly sendingStartedAt: Date | null;
  readonly sentAt: Date | null;
}

const optionalDate = (date: Date | null) =>
  date === null ? null : DateTime.fromDateUnsafe(date);

const toSummary = (row: SummaryRow) => ({
  createdAt: DateTime.fromDateUnsafe(row.createdAt),
  from:
    row.fromName === null
      ? { email: row.fromEmail }
      : { email: row.fromEmail, name: row.fromName },
  excludedListIds: row.excludedListIds,
  id: row.id,
  listIds: row.listIds,
  providerConnectionId: row.providerConnectionId,
  recipients: { failed: row.failed, sent: row.sent, total: row.total },
  replyTo: row.replyTo,
  schedule:
    row.scheduledAt === null
      ? null
      : {
          at: DateTime.fromDateUnsafe(row.scheduledAt),
          missed: row.scheduleMissed,
          timeZone: row.scheduleTimeZone,
        },
  sendingStartedAt: optionalDate(row.sendingStartedAt),
  sentAt: optionalDate(row.sentAt),
  status: row.status,
  subject: row.subject,
});

const toCampaign = (row: SummaryRow & { readonly html: string }) => ({
  ...toSummary(row),
  html: row.html,
});

const inOrganization = (organization: OrganizationId, id: CampaignId) =>
  and(eq(campaigns.organizationId, organization), eq(campaigns.id, id));

const draftColumns = (draft: typeof CampaignDraft.Type) => ({
  fromEmail: draft.from.email,
  fromName: draft.from.name ?? null,
  html: draft.html,
  providerConnectionId: draft.providerConnectionId,
  replyTo: draft.replyTo ?? null,
  subject: draft.subject,
});

const listRows = (
  organization: OrganizationId,
  id: CampaignId,
  draft: typeof CampaignDraft.Type
) => [
  ...draft.listIds.map((listId) => ({
    campaignId: id,
    excluded: false,
    listId,
    organizationId: organization,
  })),
  ...draft.excludedListIds.map((listId) => ({
    campaignId: id,
    excluded: true,
    listId,
    organizationId: organization,
  })),
];

type ListCondition = (listId: SQL, excluded: boolean) => SQL;

const listsOfCampaign =
  (organization: OrganizationId, id: CampaignId) =>
  (listId: SQL, excluded: boolean) =>
    sql`${listId} in (
      select list_id from ${campaignLists}
      where organization_id = ${organization} and campaign_id = ${id} and excluded = ${excluded}
    )`;

// WARNING: the check before each email is about consent, and its failure says so; who a Campaign leaves out is fixed when it starts sending, so a Contact added to an excluded List partway through still gets it.
const targetedListsOfCampaign =
  (organization: OrganizationId, id: CampaignId) =>
  (listId: SQL, excluded: boolean) =>
    excluded ? sql`false` : listsOfCampaign(organization, id)(listId, false);

const listsChosen =
  (lists: typeof CampaignLists.Type) => (listId: SQL, excluded: boolean) =>
    inArray(listId, excluded ? lists.excludedListIds : lists.listIds);

// WARNING: the one definition of who a Campaign goes to (subscribed to any List it goes to, once; never anyone with a Subscription of any status to a List it leaves out, an Opt-out or a Suppressed address); its count, its snapshot and the check before each email all read it, so they can't disagree.
const recipientsOf = (organization: OrganizationId, lists: ListCondition) =>
  sql`
    select c.id, c.email
    from contacts c
    where c.organization_id = ${organization}
      and c.opted_out_at is null
      and exists (
        select 1 from subscriptions s
        where s.organization_id = c.organization_id
          and s.contact_id = c.id
          and s.status = 'subscribed'
          and ${lists(sql`s.list_id`, false)}
      )
      and not exists (
        select 1 from subscriptions s
        where s.organization_id = c.organization_id
          and s.contact_id = c.id
          and ${lists(sql`s.list_id`, true)}
      )
      and not exists (
        select 1 from suppressions x
        where x.organization_id = c.organization_id
          and lower(x.email) = lower(c.email)
      )
  `;

const requireConnection = (
  db: EffectPgDatabase,
  organization: OrganizationId,
  id: ProviderConnectionId
) =>
  db
    .select({ id: providerConnections.id })
    .from(providerConnections)
    .where(
      and(
        eq(providerConnections.organizationId, organization),
        eq(providerConnections.id, id)
      )
    )
    .pipe(
      Effect.orDie,
      Effect.flatMap(([row]) =>
        row === undefined
          ? Effect.fail(new ProviderConnectionNotFound())
          : Effect.void
      )
    );

const requirePostalAddress = (
  db: EffectPgDatabase,
  organization: OrganizationId
) =>
  db
    .select({ postalAddress: organizations.postalAddress })
    .from(organizations)
    .where(eq(organizations.id, organization))
    .pipe(
      Effect.orDie,
      Effect.flatMap(([sender]) =>
        sender === undefined || sender.postalAddress === null
          ? Effect.fail(new PostalAddressRequired())
          : Effect.void
      )
    );

const NO_SCHEDULE = {
  scheduledAt: null,
  scheduleMissed: null,
  scheduleTimeZone: null,
} as const;

const outcomeValues = (outcomes: readonly RecipientOutcome[]) =>
  sql.join(
    outcomes.map((outcome) =>
      "sent" in outcome
        ? sql`(${outcome.contactId}::text, 'sent'::text, ${outcome.sent.messageId}::text, null::text, null::text)`
        : sql`(${outcome.contactId}::text, 'failed'::text, null::text, ${outcome.failed.reason}::text, ${outcome.failed.detail}::text)`
    ),
    sql`, `
  );

/**
 * An Organization's Campaigns in Postgres, with the Contacts each one goes
 * to and its delivery events. Every query is scoped to the
 * `CurrentOrganization`. A failed query is a defect.
 */
export const CampaignsLive = Layer.effect(
  Campaigns,
  Effect.gen(function* campaignsRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    const one = (organization: OrganizationId, id: CampaignId) =>
      db
        .select(campaignColumns)
        .from(campaigns)
        .where(inOrganization(organization, id))
        .pipe(
          Effect.orDie,
          Effect.flatMap(([row]) =>
            row === undefined
              ? Effect.fail(new CampaignNotFound())
              : decodeCampaign(toCampaign(row)).pipe(Effect.orDie)
          )
        );

    const refusedOrMissing = <E>(
      organization: OrganizationId,
      id: CampaignId,
      refusal: E
    ) =>
      db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(inOrganization(organization, id))
        .pipe(
          Effect.orDie,
          Effect.flatMap(([row]) =>
            Effect.fail(row === undefined ? new CampaignNotFound() : refusal)
          )
        );

    const notDraftOrMissing = (organization: OrganizationId, id: CampaignId) =>
      refusedOrMissing(organization, id, new CampaignNotDraft());

    // WARNING: run after the outcomes it counts commit, never in their transaction, or it would miss another batch's outcomes committing at the same time, and the Campaign would stay sending.
    const finishIfDone = (organization: OrganizationId, id: CampaignId) =>
      db
        .update(campaigns)
        .set({ sentAt: sql`now()`, status: "sent", updatedAt: sql`now()` })
        .where(
          and(
            inOrganization(organization, id),
            inArray(campaigns.status, ["sending", "paused"]),
            sql`${campaigns.recipientsSent} + ${campaigns.recipientsFailed} >= ${campaigns.recipientsTotal}`
          )
        );

    // WARNING: moving to the status it's already in answers with the Campaign, so a second click, or two members at once, aren't refused. One whose every email was recorded is done though not yet marked sent, so it's marked sent and refused rather than paused or cancelled.
    const moveSending = (
      organization: OrganizationId,
      id: CampaignId,
      from: readonly string[],
      to: "paused" | "cancelled"
    ) =>
      Effect.gen(function* moveSendingCampaign() {
        const [moved] = yield* db
          .update(campaigns)
          .set({ status: to, updatedAt: sql`now()` })
          .where(
            and(
              inOrganization(organization, id),
              or(
                eq(campaigns.status, to),
                and(
                  inArray(campaigns.status, from),
                  sql`${campaigns.recipientsSent} + ${campaigns.recipientsFailed} < ${campaigns.recipientsTotal}`
                )
              )
            )
          )
          .returning({ id: campaigns.id })
          .pipe(Effect.orDie);

        if (moved === undefined) {
          yield* finishIfDone(organization, id).pipe(Effect.orDie);

          return yield* refusedOrMissing(
            organization,
            id,
            new CampaignNotSending()
          );
        }

        return yield* one(organization, id).pipe(Effect.orDie);
      });

    return {
      create: (draft) =>
        Effect.gen(function* createCampaign() {
          const organization = yield* currentOrganizationId;

          yield* requireLists(db, organization, [
            ...draft.listIds,
            ...draft.excludedListIds,
          ]);
          yield* requireConnection(
            db,
            organization,
            draft.providerConnectionId
          );

          const id = yield* newCampaignId.pipe(
            Effect.provideService(SecureRandom.SecureRandom, random)
          );

          yield* db
            .transaction(() =>
              Effect.gen(function* insertCampaign() {
                yield* db.insert(campaigns).values({
                  ...draftColumns(draft),
                  id,
                  organizationId: organization,
                });

                yield* db
                  .insert(campaignLists)
                  .values(listRows(organization, id, draft));
              })
            )
            .pipe(Effect.orDie);

          return yield* one(organization, id).pipe(Effect.orDie);
        }),

      countRecipients: (lists) =>
        Effect.gen(function* countRecipients() {
          const organization = yield* currentOrganizationId;

          yield* requireLists(db, organization, [
            ...lists.listIds,
            ...lists.excludedListIds,
          ]);

          const { rows } = yield* db
            .execute<{ readonly recipients: number }>(sql`
              select count(*)::int as recipients
              from (${recipientsOf(organization, listsChosen(lists))}) as r
            `)
            .pipe(Effect.orDie);

          return rows[0]?.recipients ?? 0;
        }),

      get: (id) =>
        Effect.gen(function* getCampaign() {
          const organization = yield* currentOrganizationId;

          return yield* one(organization, id);
        }),

      page: (filter) =>
        db
          .transaction(
            () =>
              Effect.gen(function* campaignPage() {
                const organization = yield* currentOrganizationId;

                const { items, ...page } = yield* newestFirstPage(db, {
                  cursor: filter,
                  id: campaigns.id,
                  scope: eq(campaigns.organizationId, organization),
                  rows: (where, order, limit) =>
                    db
                      .select(summaryColumns)
                      .from(campaigns)
                      .where(where)
                      .orderBy(order)
                      .limit(limit),
                  table: campaigns,
                });

                return yield* decodePage({
                  ...page,
                  campaigns: items.map(toSummary),
                }).pipe(Effect.orDie);
              }),
            { accessMode: "read only", isolationLevel: "repeatable read" }
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),

      pause: (id) =>
        Effect.gen(function* pause() {
          const organization = yield* currentOrganizationId;

          return yield* moveSending(
            organization,
            id,
            ["sending", "paused"],
            "paused"
          );
        }),

      cancel: (id) =>
        Effect.gen(function* cancel() {
          const organization = yield* currentOrganizationId;

          return yield* moveSending(
            organization,
            id,
            ["sending", "paused", "cancelled"],
            "cancelled"
          );
        }),

      resume: (id, enqueue) =>
        db
          .transaction(() =>
            Effect.gen(function* resume() {
              const organization = yield* currentOrganizationId;

              const [resumed] = yield* db
                .update(campaigns)
                .set({ status: "sending", updatedAt: sql`now()` })
                .where(
                  and(
                    inOrganization(organization, id),
                    eq(campaigns.status, "paused")
                  )
                )
                .returning({ id: campaigns.id })
                .pipe(Effect.orDie);

              if (resumed === undefined) {
                const current = yield* one(organization, id);

                if (current.status !== "sending") {
                  return yield* new CampaignNotSending();
                }

                return current;
              }

              const unfinished = yield* db
                .selectDistinct({ batch: campaignRecipients.batch })
                .from(campaignRecipients)
                .where(
                  and(
                    eq(campaignRecipients.organizationId, organization),
                    eq(campaignRecipients.campaignId, id),
                    inArray(campaignRecipients.status, ["queued", "sending"])
                  )
                )
                .orderBy(asc(campaignRecipients.batch))
                .pipe(Effect.orDie);

              if (unfinished.length === 0) {
                yield* finishIfDone(organization, id).pipe(Effect.orDie);
              }

              yield* enqueue(unfinished.map((row) => row.batch));

              return yield* one(organization, id).pipe(Effect.orDie);
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),

      queuedBatch: (id, batch) =>
        Effect.gen(function* queuedBatch() {
          const organization = yield* currentOrganizationId;

          const [campaign] = yield* db
            .select({
              fromEmail: campaigns.fromEmail,
              fromName: campaigns.fromName,
              html: campaigns.html,
              organizationName: organizations.name,
              postalAddress: organizations.postalAddress,
              providerConnectionId: campaigns.providerConnectionId,
              replyTo: campaigns.replyTo,
              subject: campaigns.subject,
            })
            .from(campaigns)
            .innerJoin(
              organizations,
              eq(organizations.id, campaigns.organizationId)
            )
            .where(inOrganization(organization, id));

          if (campaign === undefined) {
            return Option.none();
          }

          const recipients = yield* db
            .select({
              contactId: campaignRecipients.contactId,
              email: campaignRecipients.email,
            })
            .from(campaignRecipients)
            .where(
              and(
                eq(campaignRecipients.organizationId, organization),
                eq(campaignRecipients.campaignId, id),
                eq(campaignRecipients.batch, batch),
                eq(campaignRecipients.status, "queued")
              )
            )
            .orderBy(asc(campaignRecipients.contactId));

          return Option.some({
            from:
              campaign.fromName === null
                ? { email: campaign.fromEmail }
                : { email: campaign.fromEmail, name: campaign.fromName },
            html: campaign.html,
            organizationName: campaign.organizationName,
            postalAddress: campaign.postalAddress,
            providerConnectionId:
              campaign.providerConnectionId === null
                ? null
                : ProviderConnectionIdSchema.make(
                    campaign.providerConnectionId
                  ),
            recipients: recipients.map((recipient) => ({
              contactId: ContactIdSchema.make(recipient.contactId),
              email: recipient.email,
            })),
            replyTo: campaign.replyTo,
            subject: campaign.subject,
          });
        }).pipe(Effect.orDie),

      // WARNING: the update waits for a concurrent claim of the same recipient to commit and then finds them no longer queued, so only one delivery ever sends to them.
      claim: (id, contactId, at) =>
        Effect.gen(function* claim() {
          const organization = yield* currentOrganizationId;

          const { rows } = yield* db.execute<{
            readonly sending: boolean;
            readonly claimed: boolean;
            readonly consents: boolean;
          }>(sql`
            with campaign as (
              select exists (
                select 1 from ${campaigns}
                where organization_id = ${organization} and id = ${id} and status = 'sending'
              ) as sending
            ),
            claimed as (
              update ${campaignRecipients}
              set status = 'sending', claimed_at = ${DateTime.formatIso(at)}::timestamptz
              where organization_id = ${organization}
                and campaign_id = ${id}
                and contact_id = ${contactId}
                and status = 'queued'
                and (select sending from campaign)
              returning contact_id
            )
            select (select sending from campaign) as sending,
              exists (select 1 from claimed) as claimed,
              exists (
                select 1
                from (${recipientsOf(organization, targetedListsOfCampaign(organization, id))}) as r
                where r.id = ${contactId}
              ) as consents
          `);

          const [row] = rows;

          if (row?.sending !== true) {
            return "stopped" as const;
          }

          if (!row.claimed) {
            return "taken" as const;
          }

          return row.consents ? ("consents" as const) : ("left" as const);
        }).pipe(Effect.orDie),

      recordOutcome: (id, outcome) =>
        Effect.gen(function* recordOutcome() {
          const organization = yield* currentOrganizationId;

          yield* db.execute(sql`
            with outcome (contact_id, status, provider_message_id, failure_reason, failure_detail) as (
              values ${outcomeValues([outcome])}
            ),
            recorded as (
              update ${campaignRecipients} as r
              set status = outcome.status,
                provider_message_id = outcome.provider_message_id,
                failure_reason = outcome.failure_reason,
                failure_detail = outcome.failure_detail,
                processed_at = now()
              from outcome
              where r.organization_id = ${organization}
                and r.campaign_id = ${id}
                and r.contact_id = outcome.contact_id
                and r.status = 'sending'
              returning r.organization_id, r.campaign_id, r.contact_id, r.status, r.provider_message_id
            ),
            events as (
              insert into delivery_events (organization_id, campaign_id, contact_id, kind, provider_message_id)
              select organization_id, campaign_id, contact_id, 'sent', provider_message_id
              from recorded
              where status = 'sent'
            )
            update ${campaigns}
            set recipients_sent = recipients_sent + (select count(*) from recorded where status = 'sent'),
              recipients_failed = recipients_failed + (select count(*) from recorded where status = 'failed'),
              updated_at = now()
            where organization_id = ${organization} and id = ${id}
              and exists (select 1 from recorded)
          `);
        }).pipe(Effect.orDie),

      putBack: (id, contactId) =>
        Effect.gen(function* putBack() {
          const organization = yield* currentOrganizationId;

          yield* db
            .update(campaignRecipients)
            .set({
              claimedAt: null,
              status: "queued",
            })
            .where(
              and(
                eq(campaignRecipients.organizationId, organization),
                eq(campaignRecipients.campaignId, id),
                eq(campaignRecipients.contactId, contactId),
                eq(campaignRecipients.status, "sending")
              )
            );
        }).pipe(Effect.orDie),

      settleBatch: (id, batch, claimedBefore, cutOff) =>
        Effect.gen(function* settleBatch() {
          const organization = yield* currentOrganizationId;

          yield* db.execute(sql`
            with cut_off as (
              update ${campaignRecipients}
              set status = 'failed',
                failure_reason = ${cutOff.reason},
                failure_detail = ${cutOff.detail},
                processed_at = now()
              where organization_id = ${organization}
                and campaign_id = ${id}
                and batch = ${batch}
                and status = 'sending'
                and claimed_at < ${DateTime.formatIso(claimedBefore)}::timestamptz
              returning 1
            )
            update ${campaigns}
            set recipients_failed = recipients_failed + (select count(*) from cut_off),
              updated_at = now()
            where organization_id = ${organization} and id = ${id}
              and exists (select 1 from cut_off)
          `);

          yield* finishIfDone(organization, id);

          // WARNING: a recipient another delivery put back in the queue after this one read the batch is unfinished too; counting only claims would let this delivery succeed and leave them queued with no delivery left to send them.
          const { rows } = yield* db.execute<{
            readonly unsettled: boolean;
          }>(sql`
            select exists (
              select 1 from ${campaignRecipients}
              where organization_id = ${organization}
                and campaign_id = ${id}
                and batch = ${batch}
                and status in ('queued', 'sending')
            ) as "unsettled"
          `);

          return { unsettled: rows[0]?.unsettled === true };
        }).pipe(Effect.orDie),

      startSending: (id, batchSize, enqueue, scheduledAt) =>
        db
          .transaction(() =>
            Effect.gen(function* startSending() {
              const organization = yield* currentOrganizationId;
              const sendNow = scheduledAt === undefined;

              const sending = {
                sendingStartedAt: sql`now()`,
                status: "sending",
                updatedAt: sql`now()`,
              };

              const [started] = yield* db
                .update(campaigns)
                .set(sendNow ? { ...NO_SCHEDULE, ...sending } : sending)
                .where(
                  and(
                    inOrganization(organization, id),
                    sendNow
                      ? eq(campaigns.status, "draft")
                      : and(
                          eq(campaigns.status, "scheduled"),
                          eq(
                            campaigns.scheduledAt,
                            DateTime.toDateUtc(scheduledAt)
                          )
                        )
                  )
                )
                .returning({
                  providerConnectionId: campaigns.providerConnectionId,
                })
                .pipe(Effect.orDie);

              if (started === undefined) {
                return yield* notDraftOrMissing(organization, id);
              }

              if (started.providerConnectionId === null) {
                return yield* new ProviderConnectionNotFound();
              }

              const [connection] = yield* db
                .select({ provider: providerConnections.provider })
                .from(providerConnections)
                .where(
                  and(
                    eq(providerConnections.organizationId, organization),
                    eq(providerConnections.id, started.providerConnectionId)
                  )
                )
                .pipe(Effect.orDie);

              if (connection === undefined) {
                return yield* new ProviderConnectionNotFound();
              }

              const size = batchSize(
                yield* decodeProvider(connection.provider).pipe(Effect.orDie)
              );

              yield* requirePostalAddress(db, organization);

              const snapshot = yield* db
                .execute<{ readonly recipients: number }>(sql`
                  with snapshot as (
                    insert into ${campaignRecipients} (organization_id, campaign_id, contact_id, email, batch)
                    select ${organization}, ${id}, r.id, r.email,
                      (row_number() over (order by r.id) - 1) / ${size}
                    from (${recipientsOf(organization, listsOfCampaign(organization, id))}) as r
                    returning 1
                  )
                  select count(*)::int as recipients from snapshot
                `)
                .pipe(Effect.orDie);

              const recipients = snapshot.rows[0]?.recipients ?? 0;

              if (recipients === 0) {
                return yield* new NoSubscribedContacts();
              }

              yield* db
                .update(campaigns)
                .set({ recipientsTotal: recipients })
                .where(inOrganization(organization, id))
                .pipe(Effect.orDie);

              yield* enqueue(Math.ceil(recipients / size));

              return yield* one(organization, id).pipe(Effect.orDie);
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),

      schedule: (id, at, timeZone, schedule) =>
        db
          .transaction(() =>
            Effect.gen(function* scheduleCampaign() {
              const organization = yield* currentOrganizationId;

              const [scheduled] = yield* db
                .update(campaigns)
                .set({
                  scheduledAt: DateTime.toDateUtc(at),
                  scheduleMissed: null,
                  scheduleTimeZone: timeZone,
                  status: "scheduled",
                  updatedAt: sql`now()`,
                })
                .where(
                  and(
                    inOrganization(organization, id),
                    inArray(campaigns.status, ["draft", "scheduled"])
                  )
                )
                .returning({
                  providerConnectionId: campaigns.providerConnectionId,
                })
                .pipe(Effect.orDie);

              if (scheduled === undefined) {
                return yield* notDraftOrMissing(organization, id);
              }

              if (scheduled.providerConnectionId === null) {
                return yield* new ProviderConnectionNotFound();
              }

              yield* requirePostalAddress(db, organization);

              const { rows } = yield* db
                .execute<{ readonly anyone: boolean }>(sql`
                  select exists (${recipientsOf(organization, listsOfCampaign(organization, id))}) as anyone
                `)
                .pipe(Effect.orDie);

              if (rows[0]?.anyone !== true) {
                return yield* new NoSubscribedContacts();
              }

              yield* schedule;

              return yield* one(organization, id).pipe(Effect.orDie);
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),

      cancelSchedule: (id) =>
        Effect.gen(function* cancelSchedule() {
          const organization = yield* currentOrganizationId;

          const [cancelled] = yield* db
            .update(campaigns)
            .set({ ...NO_SCHEDULE, status: "draft", updatedAt: sql`now()` })
            .where(
              and(
                inOrganization(organization, id),
                inArray(campaigns.status, ["draft", "scheduled"])
              )
            )
            .returning({ id: campaigns.id })
            .pipe(Effect.orDie);

          if (cancelled === undefined) {
            return yield* notDraftOrMissing(organization, id);
          }

          return yield* one(organization, id).pipe(Effect.orDie);
        }),

      missSchedule: (id, at, reason) =>
        Effect.gen(function* missSchedule() {
          const organization = yield* currentOrganizationId;

          yield* db
            .update(campaigns)
            .set({
              scheduleMissed: reason,
              status: "draft",
              updatedAt: sql`now()`,
            })
            .where(
              and(
                inOrganization(organization, id),
                eq(campaigns.status, "scheduled"),
                eq(campaigns.scheduledAt, DateTime.toDateUtc(at))
              )
            );
        }).pipe(Effect.orDie),

      update: (id, draft) =>
        Effect.gen(function* updateCampaign() {
          const organization = yield* currentOrganizationId;

          yield* requireLists(db, organization, [
            ...draft.listIds,
            ...draft.excludedListIds,
          ]);
          yield* requireConnection(
            db,
            organization,
            draft.providerConnectionId
          );

          const updated = yield* db
            .transaction(() =>
              Effect.gen(function* replaceDraft() {
                const [row] = yield* db
                  .update(campaigns)
                  .set({ ...draftColumns(draft), updatedAt: sql`now()` })
                  .where(
                    and(
                      inOrganization(organization, id),
                      eq(campaigns.status, "draft")
                    )
                  )
                  .returning({ id: campaigns.id });

                if (row === undefined) {
                  return false;
                }

                yield* db
                  .delete(campaignLists)
                  .where(
                    and(
                      eq(campaignLists.organizationId, organization),
                      eq(campaignLists.campaignId, id)
                    )
                  );
                yield* db
                  .insert(campaignLists)
                  .values(listRows(organization, id, draft));

                return true;
              })
            )
            .pipe(Effect.orDie);

          if (!updated) {
            return yield* notDraftOrMissing(organization, id);
          }

          return yield* one(organization, id).pipe(Effect.orDie);
        }),
    };
  })
);
