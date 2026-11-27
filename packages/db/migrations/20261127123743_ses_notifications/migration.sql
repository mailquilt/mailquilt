CREATE TABLE "sns_messages" (
	"organization_id" text,
	"message_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sns_messages_pkey" PRIMARY KEY("organization_id","message_id")
);
--> statement-breakpoint
CREATE INDEX "campaign_recipients_provider_message_id_idx" ON "campaign_recipients" ("organization_id","provider_message_id") WHERE "provider_message_id" is not null;--> statement-breakpoint
CREATE INDEX "delivery_events_soft_bounces_idx" ON "delivery_events" ("organization_id","occurred_at") WHERE "kind" = 'soft-bounced';--> statement-breakpoint
ALTER TABLE "sns_messages" ADD CONSTRAINT "sns_messages_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_events" DROP CONSTRAINT "delivery_events_kind_check", ADD CONSTRAINT "delivery_events_kind_check" CHECK ("kind" in ('sent', 'bounced', 'soft-bounced', 'complained'));--> statement-breakpoint
ALTER TABLE "suppressions" DROP CONSTRAINT "suppressions_reason_check", ADD CONSTRAINT "suppressions_reason_check" CHECK ("reason" in ('hard-bounce', 'soft-bounce', 'complaint', 'manual'));