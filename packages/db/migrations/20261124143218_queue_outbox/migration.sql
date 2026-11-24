CREATE TABLE "queue_outbox" (
	"id" bigserial PRIMARY KEY,
	"message" jsonb NOT NULL
);
