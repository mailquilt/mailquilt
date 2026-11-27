ALTER TABLE "provider_connections" ADD COLUMN "default_for_campaigns" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_default_for_campaigns_key" ON "provider_connections" ("organization_id") WHERE "default_for_campaigns";--> statement-breakpoint
UPDATE "provider_connections" AS "connection" SET "default_for_campaigns" = true WHERE "connection"."id" = (SELECT "oldest"."id" FROM "provider_connections" AS "oldest" WHERE "oldest"."organization_id" = "connection"."organization_id" ORDER BY "oldest"."created_at", "oldest"."id" LIMIT 1);
