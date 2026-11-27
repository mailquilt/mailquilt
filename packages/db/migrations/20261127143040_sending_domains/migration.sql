CREATE TABLE "sending_domains" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"domain" text NOT NULL,
	"dkim_selectors" text[] NOT NULL,
	"return_path" text,
	"last_check" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sending_domains_organization_id_domain_key" ON "sending_domains" ("organization_id","domain");--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_schedule_missed_check", ADD CONSTRAINT "campaigns_schedule_missed_check" CHECK ("schedule_missed" in ('no-provider-connection', 'no-subscribed-contacts', 'no-sending-domain', 'sending-domain-not-ready'));