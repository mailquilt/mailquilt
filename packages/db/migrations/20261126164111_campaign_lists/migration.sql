-- Hand-edited after drizzle-kit generate: each Campaign's one List is copied
-- into campaign_lists as a List it goes to before campaigns.list_id is
-- dropped, so drafts keep their List.
CREATE TABLE "campaign_lists" (
	"organization_id" text NOT NULL,
	"campaign_id" text,
	"list_id" text,
	"excluded" boolean NOT NULL,
	CONSTRAINT "campaign_lists_pkey" PRIMARY KEY("campaign_id","list_id")
);
--> statement-breakpoint
INSERT INTO "campaign_lists" ("organization_id", "campaign_id", "list_id", "excluded")
SELECT "organization_id", "id", "list_id", false FROM "campaigns";--> statement-breakpoint
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_list_fkey";--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "list_id";--> statement-breakpoint
ALTER TABLE "campaign_lists" ADD CONSTRAINT "campaign_lists_campaign_fkey" FOREIGN KEY ("organization_id","campaign_id") REFERENCES "campaigns"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_lists" ADD CONSTRAINT "campaign_lists_list_fkey" FOREIGN KEY ("organization_id","list_id") REFERENCES "lists"("organization_id","id");