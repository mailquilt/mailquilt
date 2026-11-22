CREATE TABLE "instance" (
	"id" boolean PRIMARY KEY DEFAULT true,
	"sign_up" text DEFAULT 'invite-only' NOT NULL,
	"system_mailer_from_name" text,
	"system_mailer_from_email" text,
	"system_mailer_smtp" jsonb,
	"system_mailer_credentials" text,
	"system_mailer_credentials_key_version" integer,
	"set_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_id_check" CHECK ("id"),
	CONSTRAINT "instance_sign_up_check" CHECK ("sign_up" in ('invite-only', 'open')),
	CONSTRAINT "instance_system_mailer_check" CHECK (("system_mailer_from_email" is null) = ("system_mailer_smtp" is null)),
	CONSTRAINT "instance_system_mailer_credentials_check" CHECK (("system_mailer_credentials" is null) = ("system_mailer_credentials_key_version" is null) and ("system_mailer_credentials" is null or "system_mailer_smtp" is not null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "instance_admin" boolean DEFAULT false NOT NULL;