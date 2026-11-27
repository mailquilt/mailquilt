CREATE TABLE "send_slots" (
	"organization_id" text,
	"provider_connection_id" text,
	"next_at" timestamp with time zone NOT NULL,
	CONSTRAINT "send_slots_pkey" PRIMARY KEY("organization_id","provider_connection_id")
);
--> statement-breakpoint
ALTER TABLE "provider_connections" ADD COLUMN "emails_per_minute" integer;--> statement-breakpoint
ALTER TABLE "send_slots" ADD CONSTRAINT "send_slots_provider_connection_fkey" FOREIGN KEY ("organization_id","provider_connection_id") REFERENCES "provider_connections"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_emails_per_minute_check" CHECK ("emails_per_minute" between 10 and 60000);