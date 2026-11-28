import { currentOrganizationId, DeliveryFeedback } from "@repo/core";
import type { SesFeedbackKind } from "@repo/core";
import { newSuppressionId } from "@repo/domain";
import type { OrganizationId } from "@repo/domain";
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
  readonly campaign_id: string;
  readonly contact_id: string;
  readonly email: string;
  readonly provider_message_id: string | null;
}

/**
 * Bounces and complaints in Postgres, scoped to the request's
 * `CurrentOrganization`. Each SNS message is recorded in one transaction:
 * its ID, the delivery event, and any Suppression, so a failure leaves
 * nothing and SNS's next try records it whole. A bounce to a bounce address
 * is recorded the same way, in one transaction, found by its Campaign and
 * Contact. An email has at most one event of each kind, so the same bounce
 * reported twice, as when an identity's notifications and a configuration
 * set's both reach the URL, counts once. A failed query is a defect.
 */
export const DeliveryFeedbackLive = Layer.effect(
  DeliveryFeedback,
  Effect.gen(function* deliveryFeedbackRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    // WARNING: an email has at most one event of each kind, so the same bounce reported twice counts once, and a replayed one can't add to the soft bounces that Suppress an address.
    const recordFor = (
      organization: OrganizationId,
      recipient: RecipientRow | undefined,
      kind: SesFeedbackKind
    ) =>
      Effect.gen(function* recordForRecipient() {
        if (recipient === undefined) {
          return;
        }

        yield* db.execute(sql`
          insert into delivery_events (organization_id, campaign_id, contact_id, kind, provider_message_id)
          select ${organization}, ${recipient.campaign_id}, ${recipient.contact_id}, ${EVENT_KIND[kind]}, ${recipient.provider_message_id}
          where not exists (
            select 1 from delivery_events
            where organization_id = ${organization}
              and campaign_id = ${recipient.campaign_id}
              and contact_id = ${recipient.contact_id}
              and kind = ${EVENT_KIND[kind]}
          )
        `);

        const id = yield* newSuppressionId.pipe(
          Effect.provideService(SecureRandom.SecureRandom, random)
        );

        if (kind !== "soft-bounce") {
          yield* db.execute(sql`
            insert into suppressions (id, organization_id, email, reason)
            values (${id}, ${organization}, ${recipient.email}, ${kind})
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
      });

    return {
      recordBounce: (email, failed) =>
        db
          .transaction(() =>
            Effect.gen(function* recordBounce() {
              const organization = yield* currentOrganizationId;

              // WARNING: locked, as `record` locks it, so the same bounce delivered twice at once records one event. Matched by Campaign and Contact, which the signed address names, not by message ID: an email whose send was cut off has none, and its bounce still counts.
              const { rows: recipients } = yield* db.execute<RecipientRow>(sql`
                select campaign_id, contact_id, email, provider_message_id
                from campaign_recipients
                where organization_id = ${organization}
                  and campaign_id = ${email.campaignId}
                  and contact_id = ${email.contactId}
                for update
              `);

              const [recipient] = recipients;

              // WARNING: a report about another address, such as one member of an alias the email went to, says nothing about this one, and a Suppression can't be undone by hand.
              const delivery = failed.find(
                (candidate) =>
                  candidate.recipient.toLowerCase() ===
                  recipient?.email.toLowerCase()
              );

              if (recipient === undefined || delivery === undefined) {
                return false;
              }

              yield* recordFor(organization, recipient, delivery.kind);

              return true;
            })
          )
          .pipe(Effect.orDie),

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

              // WARNING: the recipient's row is locked in a statement of its own, so a second copy of this bounce in another SNS message waits here, and its check below then sees this one's event.
              const { rows: recipients } = yield* db.execute<RecipientRow>(sql`
                select campaign_id, contact_id, email, provider_message_id
                from campaign_recipients
                where organization_id = ${organization}
                  and provider_message_id = ${feedback.providerMessageId}
                limit 1
                for update
              `);

              yield* recordFor(organization, recipients[0], feedback.kind);
            })
          )
          .pipe(Effect.orDie),
    };
  })
);
