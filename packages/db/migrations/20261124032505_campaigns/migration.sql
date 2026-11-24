-- Hand-edited after drizzle-kit generate: Drizzle can't declare a partitioned
-- table or an ON DELETE SET NULL limited to some columns. delivery_events is
-- partitioned by month of occurred_at; create_delivery_event_partitions makes
-- the partitions, here for this month and the next three, and again from a
-- daily job. Deleting a Provider Connection clears only a Campaign's
-- provider_connection_id, never its organization_id.
CREATE TABLE "campaign_recipients" (
	"organization_id" text NOT NULL,
	"campaign_id" text,
	"contact_id" text,
	"email" text NOT NULL,
	"batch" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"failure_reason" text,
	"failure_detail" text,
	"processed_at" timestamp with time zone,
	CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY("campaign_id","contact_id"),
	CONSTRAINT "campaign_recipients_status_check" CHECK ("status" in ('queued', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"subject" text NOT NULL,
	"from_name" text,
	"from_email" text NOT NULL,
	"reply_to" text,
	"list_id" text NOT NULL,
	"provider_connection_id" text,
	"html" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sending_started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "campaigns_status_check" CHECK ("status" in ('draft', 'sending', 'sent'))
);
--> statement-breakpoint
CREATE TABLE "delivery_events" (
	"id" bigserial,
	"organization_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"kind" text NOT NULL,
	"provider_message_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_events_pkey" PRIMARY KEY("occurred_at","id"),
	CONSTRAINT "delivery_events_kind_check" CHECK ("kind" in ('sent'))
) PARTITION BY RANGE ("occurred_at");
--> statement-breakpoint
CREATE INDEX "campaign_recipients_campaign_id_batch_idx" ON "campaign_recipients" ("campaign_id","batch");--> statement-breakpoint
CREATE INDEX "delivery_events_campaign_id_idx" ON "delivery_events" ("campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_fkey" FOREIGN KEY ("organization_id","campaign_id") REFERENCES "campaigns"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_list_fkey" FOREIGN KEY ("organization_id","list_id") REFERENCES "lists"("organization_id","id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_provider_connection_fkey" FOREIGN KEY ("organization_id","provider_connection_id") REFERENCES "provider_connections"("organization_id","id") ON DELETE SET NULL ("provider_connection_id");--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_campaign_fkey" FOREIGN KEY ("organization_id","campaign_id") REFERENCES "campaigns"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE FUNCTION "create_delivery_event_partitions"("months_ahead" integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	"month" timestamp;
BEGIN
	-- Two replicas running this at once would race to create the same partition.
	PERFORM pg_advisory_xact_lock(hashtext('create_delivery_event_partitions'));
	FOR "offset" IN 0..months_ahead LOOP
		"month" := date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => "offset");
		EXECUTE format(
			'CREATE TABLE IF NOT EXISTS %I PARTITION OF "delivery_events" FOR VALUES FROM (%L) TO (%L)',
			'delivery_events_' || to_char("month", 'YYYY_MM'),
			"month" AT TIME ZONE 'UTC',
			("month" + interval '1 month') AT TIME ZONE 'UTC'
		);
	END LOOP;
END
$$;--> statement-breakpoint
SELECT "create_delivery_event_partitions"(3);
