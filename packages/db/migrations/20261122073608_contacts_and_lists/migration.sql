CREATE TABLE "contacts" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_organization_id_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lists_organization_id_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"list_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_list_id_contact_id_key" UNIQUE("list_id","contact_id"),
	CONSTRAINT "subscriptions_status_check" CHECK ("status" in ('pending', 'subscribed', 'unsubscribed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_organization_id_email_key" ON "contacts" ("organization_id",lower("email"));--> statement-breakpoint
CREATE INDEX "subscriptions_list_id_id_idx" ON "subscriptions" ("list_id","id");--> statement-breakpoint
CREATE INDEX "subscriptions_organization_id_contact_id_idx" ON "subscriptions" ("organization_id","contact_id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_list_fkey" FOREIGN KEY ("organization_id","list_id") REFERENCES "lists"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_contact_fkey" FOREIGN KEY ("organization_id","contact_id") REFERENCES "contacts"("organization_id","id") ON DELETE CASCADE;