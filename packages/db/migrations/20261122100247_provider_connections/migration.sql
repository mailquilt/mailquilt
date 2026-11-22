CREATE TABLE "provider_connections" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"from_name" text,
	"from_email" text NOT NULL,
	"settings" jsonb NOT NULL,
	"credentials" text,
	"credentials_key_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_connections_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "provider_connections_provider_check" CHECK ("provider" in ('smtp')),
	CONSTRAINT "provider_connections_credentials_check" CHECK (("credentials" is null) = ("credentials_key_version" is null))
);
--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;