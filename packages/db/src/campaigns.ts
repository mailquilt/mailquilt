import type { CampaignFilter, RecipientOutcome } from "@repo/core";
import { Campaigns, CurrentOrganization } from "@repo/core";
import type {
  CampaignDraft,
  CampaignId,
  OrganizationId,
  ProviderConnectionId,
} from "@repo/domain";
import {
  Campaign,
  CampaignNotDraft,
  CampaignNotFound,
  CampaignPage,
  ContactIdSchema,
  newCampaignId,
  NoSubscribedContacts,
  PAGE_SIZE,
  ProviderConnectionIdSchema,
  ProviderConnectionNotFound,
} from "@repo/domain";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { requireLists } from "./require-lists.ts";
import {
  campaignRecipients,
  campaigns,
  providerConnections,
} from "./schema.ts";

const decodeCampaign = Schema.decodeUnknownEffect(Campaign);

const decodePage = Schema.decodeUnknownEffect(CampaignPage);

const recipientsWithStatus = (status?: string) =>
  sql<number>`(select count(*) from ${campaignRecipients} where ${campaignRecipients.campaignId} = ${campaigns.id}${
    status === undefined
      ? sql``
      : sql` and ${campaignRecipients.status} = ${status}`
  })::int`;

const summaryColumns = {
  createdAt: campaigns.createdAt,
  failed: recipientsWithStatus("failed"),
  fromEmail: campaigns.fromEmail,
  fromName: campaigns.fromName,
  id: campaigns.id,
  listId: campaigns.listId,
  providerConnectionId: campaigns.providerConnectionId,
  replyTo: campaigns.replyTo,
  sendingStartedAt: campaigns.sendingStartedAt,
  sent: recipientsWithStatus("sent"),
  sentAt: campaigns.sentAt,
  status: campaigns.status,
  subject: campaigns.subject,
  total: recipientsWithStatus(),
};

const campaignColumns = { ...summaryColumns, html: campaigns.html };

interface SummaryRow {
  readonly id: string;
  readonly subject: string;
  readonly fromName: string | null;
  readonly fromEmail: string;
  readonly replyTo: string | null;
  readonly listId: string;
  readonly providerConnectionId: string | null;
  readonly status: string;
  readonly total: number;
  readonly sent: number;
  readonly failed: number;
  readonly createdAt: Date;
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
  id: row.id,
  listId: row.listId,
  providerConnectionId: row.providerConnectionId,
  recipients: { failed: row.failed, sent: row.sent, total: row.total },
  replyTo: row.replyTo,
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
  listId: draft.listId,
  providerConnectionId: draft.providerConnectionId,
  replyTo: draft.replyTo ?? null,
  subject: draft.subject,
});

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

    const notDraftOrMissing = (organization: OrganizationId, id: CampaignId) =>
      db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(inOrganization(organization, id))
        .pipe(
          Effect.orDie,
          Effect.flatMap(([row]) =>
            Effect.fail(
              row === undefined
                ? new CampaignNotFound()
                : new CampaignNotDraft()
            )
          )
        );

    const newestFirstPageAroundCursor = (
      organization: OrganizationId,
      filter: CampaignFilter
    ) => {
      const where = eq(campaigns.organizationId, organization);

      if (filter.before !== undefined) {
        return db
          .select(summaryColumns)
          .from(campaigns)
          .where(and(where, gt(campaigns.id, filter.before)))
          .orderBy(asc(campaigns.id))
          .limit(PAGE_SIZE)
          .pipe(
            Effect.orDie,
            Effect.map((rows) => rows.toReversed())
          );
      }

      return db
        .select(summaryColumns)
        .from(campaigns)
        .where(
          and(
            where,
            filter.after === undefined
              ? undefined
              : lt(campaigns.id, filter.after)
          )
        )
        .orderBy(desc(campaigns.id))
        .limit(PAGE_SIZE)
        .pipe(Effect.orDie);
    };

    return {
      create: (draft) =>
        Effect.gen(function* createCampaign() {
          const organization = (yield* CurrentOrganization).id;

          yield* requireLists(db, organization, [draft.listId]);
          yield* requireConnection(
            db,
            organization,
            draft.providerConnectionId
          );

          const id = yield* newCampaignId.pipe(
            Effect.provideService(SecureRandom.SecureRandom, random)
          );

          yield* db
            .insert(campaigns)
            .values({
              ...draftColumns(draft),
              id,
              organizationId: organization,
            })
            .pipe(Effect.orDie);

          return yield* one(organization, id).pipe(Effect.orDie);
        }),

      get: (id) =>
        Effect.gen(function* getCampaign() {
          const organization = (yield* CurrentOrganization).id;

          return yield* one(organization, id);
        }),

      page: (filter) =>
        db
          .transaction(
            () =>
              Effect.gen(function* campaignPage() {
                const organization = (yield* CurrentOrganization).id;

                const inWindow = yield* newestFirstPageAroundCursor(
                  organization,
                  filter
                );

                const cursorPassedEveryCampaign =
                  inWindow.length === 0 &&
                  (filter.after !== undefined || filter.before !== undefined);

                const items = cursorPassedEveryCampaign
                  ? yield* newestFirstPageAroundCursor(organization, {})
                  : inWindow;

                const first = items[0]?.id ?? "";

                const [counted] = yield* db
                  .select({
                    start: sql<number>`(count(*) filter (where ${campaigns.id} > ${first}))::int`,
                    total: sql<number>`count(*)::int`,
                  })
                  .from(campaigns)
                  .where(eq(campaigns.organizationId, organization))
                  .pipe(Effect.orDie);

                const start = counted?.start ?? 0;
                const total = counted?.total ?? 0;

                return yield* decodePage({
                  campaigns: items.map(toSummary),
                  next:
                    start + items.length < total
                      ? (items.at(-1)?.id ?? null)
                      : null,
                  previous: start > 0 ? (items[0]?.id ?? null) : null,
                  start,
                  total,
                }).pipe(Effect.orDie);
              }),
            { accessMode: "read only", isolationLevel: "repeatable read" }
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),

      queuedBatch: (id, batch) =>
        Effect.gen(function* queuedBatch() {
          const organization = (yield* CurrentOrganization).id;

          const [campaign] = yield* db
            .select({
              fromEmail: campaigns.fromEmail,
              fromName: campaigns.fromName,
              html: campaigns.html,
              providerConnectionId: campaigns.providerConnectionId,
              replyTo: campaigns.replyTo,
              subject: campaigns.subject,
            })
            .from(campaigns)
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

      // WARNING: the Campaign is marked sent in a statement after the outcomes commit; in their transaction, it would miss another batch's outcomes committing at the same time, and stay sending.
      recordOutcomes: (id, outcomes) =>
        Effect.gen(function* recordOutcomes() {
          const organization = (yield* CurrentOrganization).id;

          if (outcomes.length > 0) {
            yield* db.execute(sql`
              with outcome (contact_id, status, provider_message_id, failure_reason, failure_detail) as (
                values ${outcomeValues(outcomes)}
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
                  and r.status = 'queued'
                returning r.organization_id, r.campaign_id, r.contact_id, r.status, r.provider_message_id
              )
              insert into delivery_events (organization_id, campaign_id, contact_id, kind, provider_message_id)
              select organization_id, campaign_id, contact_id, 'sent', provider_message_id
              from recorded
              where status = 'sent'
            `);
          }

          yield* db
            .update(campaigns)
            .set({ sentAt: sql`now()`, status: "sent", updatedAt: sql`now()` })
            .where(
              and(
                inOrganization(organization, id),
                eq(campaigns.status, "sending"),
                sql`not exists (select 1 from ${campaignRecipients} where ${campaignRecipients.campaignId} = ${id} and ${campaignRecipients.status} = 'queued')`
              )
            );
        }).pipe(Effect.orDie),

      startSending: (id, batchSize, enqueue) =>
        db
          .transaction(() =>
            Effect.gen(function* startSending() {
              const organization = (yield* CurrentOrganization).id;

              const [started] = yield* db
                .update(campaigns)
                .set({
                  sendingStartedAt: sql`now()`,
                  status: "sending",
                  updatedAt: sql`now()`,
                })
                .where(
                  and(
                    inOrganization(organization, id),
                    eq(campaigns.status, "draft")
                  )
                )
                .returning({
                  listId: campaigns.listId,
                  providerConnectionId: campaigns.providerConnectionId,
                })
                .pipe(Effect.orDie);

              if (started === undefined) {
                return yield* notDraftOrMissing(organization, id);
              }

              if (started.providerConnectionId === null) {
                return yield* new ProviderConnectionNotFound();
              }

              const snapshot = yield* db
                .execute<{ readonly recipients: number }>(sql`
                  with snapshot as (
                    insert into ${campaignRecipients} (organization_id, campaign_id, contact_id, email, batch)
                    select ${organization}, ${id}, c.id, c.email,
                      (row_number() over (order by c.id) - 1) / ${batchSize}
                    from subscriptions s
                    join contacts c on c.organization_id = s.organization_id and c.id = s.contact_id
                    where s.organization_id = ${organization}
                      and s.list_id = ${started.listId}
                      and s.status = 'subscribed'
                    returning 1
                  )
                  select count(*)::int as recipients from snapshot
                `)
                .pipe(Effect.orDie);

              const recipients = snapshot.rows[0]?.recipients ?? 0;

              if (recipients === 0) {
                return yield* new NoSubscribedContacts();
              }

              yield* enqueue(Math.ceil(recipients / batchSize));

              return yield* one(organization, id).pipe(Effect.orDie);
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),

      update: (id, draft) =>
        Effect.gen(function* updateCampaign() {
          const organization = (yield* CurrentOrganization).id;

          yield* requireLists(db, organization, [draft.listId]);
          yield* requireConnection(
            db,
            organization,
            draft.providerConnectionId
          );

          const updated = yield* db
            .update(campaigns)
            .set({ ...draftColumns(draft), updatedAt: sql`now()` })
            .where(
              and(
                inOrganization(organization, id),
                eq(campaigns.status, "draft")
              )
            )
            .returning({ id: campaigns.id })
            .pipe(Effect.orDie);

          if (updated.length === 0) {
            return yield* notDraftOrMissing(organization, id);
          }

          return yield* one(organization, id).pipe(Effect.orDie);
        }),
    };
  })
);
