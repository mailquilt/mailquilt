import { currentOrganizationId, DeliveryFeedback } from "@repo/core";
import type { SesFeedbackKind } from "@repo/core";
import { newSuppressionId } from "@repo/domain";
import { sql } from "drizzle-orm";
import { DateTime, Effect, Layer } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";

const SOFT_BOUNCES_TO_SUPPRESS = 3;

const SOFT_BOUNCE_DAYS = 7;

const EVENT_KIND = {
  complaint: "complained",
  "hard-bounce": "bounced",
  "soft-bounce": "soft-bounced",
} as const satisfies Record<SesFeedbackKind, string>;

interface RecipientRow {
  readonly email: string;
}

/**
 * Bounces and complaints in Postgres, scoped to the request's
 * `CurrentOrganization`. Each SNS message is recorded in one transaction:
 * its ID, the delivery event, and any Suppression, so a failure leaves
 * nothing and SNS's next try records it whole. An email has at most one
 * event of each kind, so the same bounce reported in two SNS messages, as
 * when an identity's notifications and a configuration set's both reach the
 * URL, counts once. A failed query is a defect.
 */
export const DeliveryFeedbackLive = Layer.effect(
  DeliveryFeedback,
  Effect.gen(function* deliveryFeedbackRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    return {
      record: (message, feedback) =>
        db
          .transaction(() =>
            Effect.gen(function* recordFeedback() {
              const organization = yield* currentOrganizationId;

              yield* db.execute(sql`
                delete from sns_messages
                where organization_id = ${organization} and expires_at < now()
              `);

              const { rows: fresh } = yield* db.execute(sql`
                insert into sns_messages (organization_id, message_id, expires_at)
                values (${organization}, ${message.id}, ${DateTime.formatIso(message.expiresAt)})
                on conflict do nothing
                returning 1
              `);

              if (fresh.length === 0) {
                return;
              }

              const { rows: recipients } = yield* db.execute<RecipientRow>(sql`
                with recipient as (
                  select campaign_id, contact_id, email
                  from campaign_recipients
                  where organization_id = ${organization}
                    and provider_message_id = ${feedback.providerMessageId}
                  limit 1
                ),
                event as (
                  insert into delivery_events (organization_id, campaign_id, contact_id, kind, provider_message_id)
                  select ${organization}, r.campaign_id, r.contact_id, ${EVENT_KIND[feedback.kind]}, ${feedback.providerMessageId}
                  from recipient r
                  where not exists (
                    select 1 from delivery_events e
                    where e.organization_id = ${organization}
                      and e.campaign_id = r.campaign_id
                      and e.contact_id = r.contact_id
                      and e.kind = ${EVENT_KIND[feedback.kind]}
                  )
                )
                select email from recipient
              `);

              const [recipient] = recipients;

              if (recipient === undefined) {
                return;
              }

              const id = yield* newSuppressionId.pipe(
                Effect.provideService(SecureRandom.SecureRandom, random)
              );

              if (feedback.kind !== "soft-bounce") {
                yield* db.execute(sql`
                  insert into suppressions (id, organization_id, email, reason)
                  values (${id}, ${organization}, ${recipient.email}, ${feedback.kind})
                  on conflict do nothing
                `);

                return;
              }

              // WARNING: counted by the address each bounced email went to, not the Contact, since a Suppression blocks an address.
              yield* db.execute(sql`
                insert into suppressions (id, organization_id, email, reason)
                select ${id}, ${organization}, ${recipient.email}, 'soft-bounce'
                where (
                  select count(*)
                  from delivery_events e
                  join campaign_recipients r on r.campaign_id = e.campaign_id and r.contact_id = e.contact_id
                  where e.organization_id = ${organization}
                    and e.kind = 'soft-bounced'
                    and e.occurred_at > now() - make_interval(days => ${SOFT_BOUNCE_DAYS})
                    and lower(r.email) = lower(${recipient.email})
                ) >= ${SOFT_BOUNCES_TO_SUPPRESS}
                on conflict do nothing
              `);
            })
          )
          .pipe(Effect.orDie),
    };
  })
);
