ALTER TABLE "campaigns" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "schedule_time_zone" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "schedule_missed" text;--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "deliver_after" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_schedule_check" CHECK (("scheduled_at" is null) = ("schedule_time_zone" is null)
        and ("status" <> 'scheduled' or ("scheduled_at" is not null and "schedule_missed" is null))
        and ("schedule_missed" is null or ("status" = 'draft' and "scheduled_at" is not null)));--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_schedule_missed_check" CHECK ("schedule_missed" in ('no-provider-connection', 'no-subscribed-contacts'));--> statement-breakpoint
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_status_check", ADD CONSTRAINT "campaigns_status_check" CHECK ("status" in ('draft', 'scheduled', 'sending', 'sent'));