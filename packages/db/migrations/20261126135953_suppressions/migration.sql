CREATE TABLE "suppressions" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppressions_reason_check" CHECK ("reason" in ('hard-bounce', 'complaint', 'manual'))
);
--> statement-breakpoint
CREATE INDEX "suppressions_organization_id_id_idx" ON "suppressions" ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_organization_id_email_key" ON "suppressions" ("organization_id",lower("email"));--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;